/**
 * Postgres data-access layer (Supabase-compatible).
 *
 * Replaces the previous better-sqlite3 store. All functions are async and use a
 * single shared connection Pool. Set DATABASE_URL to your Supabase connection
 * string (Settings → Database → Connection string → "URI"). SSL is enabled by
 * default because Supabase requires it.
 *
 * Tables are created on boot via initDb() — no manual migration step needed.
 */

import 'dotenv/config';
import pg from 'pg';
import { buildJobQueryFilters, usEligibilityCondition, PORTAL_DATE_SQL } from './utils/roleFilters.js';
import { isUsEligible } from './utils/helpers.js';
import { detectVisaWording } from './utils/visaWording.js';
import { computeStaleUpdates } from './utils/staleness.js';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error(
        '\n❌ DATABASE_URL is not set.\n' +
        '   Create a Supabase project → Settings → Database → Connection string (URI),\n' +
        '   then put it in backend/.env as:  DATABASE_URL=postgresql://...\n'
    );
    process.exit(1);
}

// Supabase requires SSL. rejectUnauthorized:false avoids the self-signed chain error.
const useSSL = process.env.PGSSL !== 'false';

const pool = new Pool({
    connectionString,
    // Scrapers insert from ~20 sources in parallel; keep headroom for API reads.
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error('💥 Unexpected Postgres pool error:', err.message);
});

/** Run a parameterized query and return the rows. */
export async function query(text, params = []) {
    const res = await pool.query(text, params);
    return res;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    url TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    salary TEXT,
    description TEXT,
    notes TEXT,
    posted_at TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'new',
    is_new BOOLEAN NOT NULL DEFAULT true
  );

  CREATE TABLE IF NOT EXISTS scrape_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    jobs_found INTEGER DEFAULT 0,
    jobs_new INTEGER DEFAULT 0,
    errors TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watched_companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    career_url TEXT,
    ats_type TEXT NOT NULL DEFAULT 'unknown',
    ats_slug TEXT,
    watch_roles TEXT NOT NULL DEFAULT '["software engineer","SWE","SDE","data engineer","machine learning"]',
    last_checked TIMESTAMPTZ,
    last_job_hash TEXT,
    last_job_ids TEXT,
    active_jobs_count INTEGER DEFAULT 0,
    notify_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    error_msg TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS watch_notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    job_url TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
  CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
  CREATE INDEX IF NOT EXISTS idx_jobs_scraped_at ON jobs(scraped_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_is_new ON jobs(is_new);
  CREATE INDEX IF NOT EXISTS idx_watch_notifs_sent ON watch_notifications(sent_at);
`;

const DEFAULT_SETTINGS = {
    keywords_ai: 'new grad AI engineer,new grad machine learning engineer,entry level AI engineer,2026 new grad AI',
    keywords_swe: 'new grad software engineer,entry level software engineer,2026 new grad SWE,new grad full stack',
    keywords_data: 'new grad data scientist,new grad data engineer,entry level data scientist,new grad analytics engineer',
    scrape_interval_hours: '1',
    filter_exclude_senior: 'false',
    notification_enabled: 'true',
    grad_label: '2026 new grad',
};

/** Create tables (idempotent) and seed default settings. Call once on boot. */
export async function initDb() {
    await pool.query(SCHEMA);
    // Idempotent column migrations for existing databases
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_reposted BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reposted_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS previous_posted_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS missed_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS us_ineligible BOOLEAN`);
    // One-time backfill for rows saved before us_ineligible existed; new rows
    // get it from isUsEligible() in insertJob.
    const eligParams = [];
    const eligSql = usEligibilityCondition(eligParams);
    await pool.query(`UPDATE jobs SET us_ineligible = NOT (${eligSql}) WHERE us_ineligible IS NULL`, eligParams);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_portal_date ON jobs ((${PORTAL_DATE_SQL}) DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_dedup ON jobs (${DEDUP_KEY_SQL}) WHERE closed_at IS NULL`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS h1b_employers (
        key TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        filings INTEGER NOT NULL,
        last_decision_date DATE,
        fein_count INTEGER NOT NULL,
        min_fy INTEGER NOT NULL,
        max_fy INTEGER NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dead_boards (
        source TEXT NOT NULL,
        board TEXT NOT NULL,
        misses INTEGER NOT NULL DEFAULT 0,
        last_checked TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (source, board)
      )`);
    await closeDuplicateJobs();
    // Data repairs for scraper bugs (idempotent — each matches nothing once fixed):
    //  - Workday links once omitted the career-site segment (https://{host}/job/...),
    //    which 404s. Those URLs can never be refreshed, so retire them.
    await pool.query(
        `UPDATE jobs SET closed_at = now()
         WHERE source = 'workday' AND closed_at IS NULL AND status NOT IN ('saved', 'applied')
           AND url ~ '^https://[^/]+\\.myworkdayjobs\\.com/job/'`
    );
    //  - Unix-second timestamps were parsed as milliseconds (dates in Jan 1970).
    //    Clear them so the next scrape writes the real date without it being
    //    mistaken for a repost.
    await pool.query(`UPDATE jobs SET posted_at = NULL WHERE posted_at < '2000-01-01'`);
    //  - The Lever scraper's `commitment=fulltime` filter matched nothing, so every
    //    polled Lever board looked empty and the closer retired real listings.
    //    Reopen them once; anything genuinely gone is re-closed after two polls.
    const leverFix = await pool.query(
        `INSERT INTO settings (key, value) VALUES ('migration_lever_reopen_2026_10', 'done')
         ON CONFLICT (key) DO NOTHING`
    );
    if (leverFix.rowCount > 0) {
        await pool.query(`UPDATE jobs SET closed_at = NULL, missed_count = 0 WHERE source = 'lever' AND closed_at IS NOT NULL`);
    }
    //  - visa_wording (what a posting says about sponsorship) for rows saved
    //    before the column existed. New rows get it in insertJob.
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS visa_wording TEXT`);
    // Marked done only after the backfill finishes, so a crash halfway retries.
    const visaDone = await pool.query(`SELECT 1 FROM settings WHERE key = 'migration_visa_wording_2026_10'`);
    if (!visaDone.rows.length) {
        await backfillVisaWording();
        await pool.query(`INSERT INTO settings (key, value) VALUES ('migration_visa_wording_2026_10', 'done') ON CONFLICT (key) DO NOTHING`);
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await pool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
            [key, value]
        );
    }
    console.log('🗄️  Postgres schema ready');
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

const RELIST_GAP_MS = 7 * 24 * 60 * 60 * 1000;       // reappeared after 7+ days unseen
const REPOST_DATE_GAP_MS = 24 * 60 * 60 * 1000;      // portal date moved by 1+ day

function parseTs(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Same role reported by two sources under different URLs (e.g. SimplifyJobs and
// the company's own board). One open row per key is kept.
const DEDUP_KEY_SQL = `lower(company), lower(title), lower(COALESCE(location, ''))`;
// Which copy to keep: the company's own ATS, then its career site, then aggregators.
const SOURCE_RANK_SQL = `CASE
    WHEN source IN ('greenhouse','lever','ashby','workday','smartrecruiters','workable','recruitee') THEN 0
    WHEN source IN ('amazon','apple','google','eightfold','bytedance','oraclecloud') THEN 1
    ELSE 2 END`;

/** Close all but the best copy of each duplicated open role. Idempotent. */
export async function closeDuplicateJobs() {
    const res = await pool.query(`
      UPDATE jobs SET closed_at = now()
      WHERE id IN (
        SELECT id FROM (
          SELECT id, row_number() OVER (
            PARTITION BY ${DEDUP_KEY_SQL}
            ORDER BY ${SOURCE_RANK_SQL}, scraped_at DESC
          ) AS rn
          FROM jobs WHERE closed_at IS NULL
        ) ranked WHERE rn > 1
      )`);
    return res.rowCount;
}

/**
 * Close jobs no source has reported for `days` days. Sampled sources
 * (SimplifyJobs, job boards, career-site search) never mark a listing closed,
 * so without this their dead listings stayed "open" forever.
 * A source that reports the job again reopens it (see insertJob).
 */
export async function expireUnseenJobs(days = 7) {
    const res = await pool.query(
        `UPDATE jobs SET closed_at = now()
         WHERE closed_at IS NULL AND scraped_at < now() - make_interval(days => $1::int)`,
        [days]
    );
    return res.rowCount;
}

/** Compute visa_wording for every stored job with a description, 1,000 at a time. */
async function backfillVisaWording() {
    let lastId = '';
    for (;;) {
        const { rows } = await pool.query(
            `SELECT id, title, description FROM jobs WHERE description IS NOT NULL AND id > $1 ORDER BY id LIMIT 1000`,
            [lastId]
        );
        if (!rows.length) return;
        const ids = [], values = [];
        for (const r of rows) {
            const wording = detectVisaWording(r.title, r.description);
            if (wording) { ids.push(r.id); values.push(wording); }
        }
        if (ids.length) {
            await pool.query(
                `UPDATE jobs SET visa_wording = v.w FROM unnest($1::text[], $2::text[]) AS v(id, w) WHERE jobs.id = v.id`,
                [ids, values]
            );
        }
        lastId = rows[rows.length - 1].id;
    }
}

/** Portal posted date moved forward — likely a repost on the same URL. */
function isPortalDateRepost(oldPosted, newPosted) {
    if (!newPosted) return false;
    if (!oldPosted) return false;
    return newPosted.getTime() - oldPosted.getTime() >= REPOST_DATE_GAP_MS;
}

/** Job URL seen again after a long gap — listing was removed and put back up. */
function isRelistRepost(lastScrapedAt) {
    const last = parseTs(lastScrapedAt);
    if (!last) return false;
    return Date.now() - last.getTime() >= RELIST_GAP_MS;
}

/**
 * Insert or update a job by URL.
 * Returns true when a new row is created OR a repost is detected (resurfaced to user).
 */
export async function insertJob(job) {
    const existingRes = await pool.query(
        `SELECT posted_at, previous_posted_at, scraped_at FROM jobs WHERE url = $1 LIMIT 1`,
        [job.url]
    );

    if (existingRes.rows.length === 0) {
        // Same role already open under another URL (another source) — keep one.
        const dup = await pool.query(
            `SELECT 1 FROM jobs WHERE closed_at IS NULL AND (${DEDUP_KEY_SQL}) = (lower($1), lower($2), lower(COALESCE($3, ''))) LIMIT 1`,
            [job.company, job.title, job.location ?? null]
        );
        if (dup.rows.length) return false;

        const res = await pool.query(
            `INSERT INTO jobs (id, title, company, location, url, source, category, salary, description, posted_at, status, is_new, last_seen_at, missed_count, closed_at, us_ineligible, visa_wording)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',true, now(), 0, NULL, $11, $12)`,
            [
                job.id, job.title, job.company, job.location ?? null, job.url, job.source,
                job.category, job.salary ?? null, job.description ?? null, job.posted_at ?? null,
                !isUsEligible(job), detectVisaWording(job.title, job.description),
            ]
        );
        return res.rowCount > 0;
    }

    const existing = existingRes.rows[0];
    const oldPosted = parseTs(existing.posted_at);
    // An estimated date (e.g. Workday "30+ Days Ago") drifts between polls:
    // never compare it for reposts or let it overwrite the stored date.
    const newPosted = job.posted_at_estimated ? null : parseTs(job.posted_at);
    const portalRepost = isPortalDateRepost(oldPosted, newPosted);
    const relistRepost = isRelistRepost(existing.scraped_at);
    const isRepost = portalRepost || relistRepost;

    if (isRepost) {
        const previousPosted = oldPosted?.toISOString() ?? existing.previous_posted_at ?? null;
        await pool.query(
            `UPDATE jobs SET
               title = $1,
               company = $2,
               location = $3,
               category = $4,
               salary = $5,
               description = $6,
               posted_at = COALESCE($7, posted_at),
               previous_posted_at = COALESCE($8, previous_posted_at),
               is_reposted = true,
               us_ineligible = $11,
               visa_wording = $12,
               reposted_at = now(),
               scraped_at = now(),
               is_new = true,
               last_seen_at = CASE WHEN source = $10 THEN now() ELSE last_seen_at END,
               missed_count = CASE WHEN source = $10 THEN 0 ELSE missed_count END,
               closed_at = CASE WHEN source = $10 AND NOT EXISTS (
                 SELECT 1 FROM jobs d WHERE d.closed_at IS NULL AND d.url <> jobs.url
                   AND lower(d.company) = lower(jobs.company) AND lower(d.title) = lower(jobs.title)
                   AND lower(COALESCE(d.location, '')) = lower(COALESCE(jobs.location, '')))
               THEN NULL ELSE closed_at END
             WHERE url = $9`,
            [
                job.title,
                job.company,
                job.location ?? null,
                job.category,
                job.salary ?? null,
                job.description ?? null,
                job.posted_at_estimated ? null : (job.posted_at ?? null),
                previousPosted,
                job.url,
                job.source,
                !isUsEligible(job),
                detectVisaWording(job.title, job.description),
            ]
        );
        return true;
    }

    await pool.query(
        `UPDATE jobs SET
           title = $1,
           company = $2,
           location = $3,
           category = $4,
           salary = $5,
           description = COALESCE($6, description),
           posted_at = COALESCE($7, posted_at),
           scraped_at = now(),
           us_ineligible = $10,
           visa_wording = CASE WHEN $6::text IS NULL THEN visa_wording ELSE $11 END,
           last_seen_at = CASE WHEN source = $9 THEN now() ELSE last_seen_at END,
           missed_count = CASE WHEN source = $9 THEN 0 ELSE missed_count END,
           closed_at = CASE WHEN source = $9 AND NOT EXISTS (
                 SELECT 1 FROM jobs d WHERE d.closed_at IS NULL AND d.url <> jobs.url
                   AND lower(d.company) = lower(jobs.company) AND lower(d.title) = lower(jobs.title)
                   AND lower(COALESCE(d.location, '')) = lower(COALESCE(jobs.location, '')))
               THEN NULL ELSE closed_at END
         WHERE url = $8`,
        [
            job.title,
            job.company,
            job.location ?? null,
            job.category,
            job.salary ?? null,
            job.description ?? null,
            job.posted_at_estimated ? null : (job.posted_at ?? null),
            job.url,
            job.source,
            !isUsEligible(job),
            detectVisaWording(job.title, job.description),
        ]
    );
    return false;
}

/**
 * Marks jobs closed when they've been missing from `missThreshold` consecutive
 * polls of their source. Only evaluates jobs belonging to a company that was
 * actually, successfully polled this run (see fastPoll.js) — a company whose
 * fetch failed this run is never treated as "now has zero jobs."
 */
export async function closeStaleJobs(source, polledCompanies, freshUrls, missThreshold = 2) {
    if (!polledCompanies.length) return { closed: 0, incremented: 0 };

    const existingRes = await pool.query(
        `SELECT id, url, missed_count FROM jobs
         WHERE source = $1 AND company = ANY($2) AND closed_at IS NULL`,
        [source, polledCompanies]
    );

    const { toIncrement, toClose } = computeStaleUpdates(
        existingRes.rows,
        new Set(freshUrls),
        missThreshold
    );

    if (toIncrement.length) {
        await pool.query(
            `UPDATE jobs SET missed_count = missed_count + 1 WHERE id = ANY($1)`,
            [toIncrement]
        );
    }
    if (toClose.length) {
        await pool.query(
            `UPDATE jobs SET missed_count = missed_count + 1, closed_at = now() WHERE id = ANY($1)`,
            [toClose]
        );
    }

    return { closed: toClose.length, incremented: toIncrement.length };
}

// Public feed columns only — no per-user fields (status, notes, applied_at),
// since the board is shared by everyone who opens it.
const JOB_COLUMNS = `
  id, title, company, location, url, source, category, salary, description,
  posted_at, previous_posted_at, reposted_at, scraped_at, closed_at,
  visa_wording,
  is_reposted::int AS is_reposted,
  (CASE WHEN ${PORTAL_DATE_SQL} >= now() - interval '24 hours' THEN 1 ELSE 0 END) AS is_fresh
`;

export async function getJobs(filters) {
    const { where, params } = buildJobQueryFilters(filters);
    params.push(filters.limit, filters.offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const res = await pool.query(
        `SELECT ${JOB_COLUMNS}
         FROM jobs
         WHERE ${where}
         ORDER BY ${PORTAL_DATE_SQL} DESC NULLS LAST
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
    );
    return res.rows;
}

export async function countJobs(filters) {
    const { where, params } = buildJobQueryFilters(filters);
    const res = await pool.query(
        `SELECT COUNT(*)::int AS total FROM jobs WHERE ${where}`,
        params
    );
    return res.rows[0].total;
}

/** Counts for the shared feed: open, US-eligible jobs (what /api/jobs shows by default). */
export async function getStats() {
    const res = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN ${PORTAL_DATE_SQL} >= now() - interval '24 hours' THEN 1 ELSE 0 END), 0)::int AS last_24h,
        COALESCE(SUM(CASE WHEN ${PORTAL_DATE_SQL} >= now() - interval '7 days' THEN 1 ELSE 0 END), 0)::int AS last_7d,
        COUNT(DISTINCT company)::int AS companies
      FROM jobs
      WHERE closed_at IS NULL AND us_ineligible IS NOT TRUE
    `);
    return res.rows[0];
}

export async function getAllJobsForReclassify() {
    const res = await pool.query('SELECT id, title, description FROM jobs');
    return res.rows;
}

export async function updateJobCategory(category, id) {
    const res = await pool.query('UPDATE jobs SET category = $1 WHERE id = $2', [category, id]);
    return res.rowCount;
}

// ── Scrape Runs ────────────────────────────────────────────────────────────────

export async function startScrapeRun() {
    const res = await pool.query(
        'INSERT INTO scrape_runs (started_at) VALUES (now()) RETURNING id'
    );
    return res.rows[0].id;
}

export async function finishScrapeRun(jobsFound, jobsNew, errors, id) {
    await pool.query(
        `UPDATE scrape_runs
         SET finished_at = now(), jobs_found = $1, jobs_new = $2, errors = $3
         WHERE id = $4`,
        [jobsFound, jobsNew, errors, id]
    );
}

/**
 * Latest FINISHED scrape run (an in-progress run has no finish time, which
 * made the dashboard show "Never"), plus whether one is running right now.
 * Runs left unfinished by a restart are ignored after 2 hours.
 */
export async function getLastScrapeRun() {
    const res = await pool.query(`
      SELECT r.*,
             EXISTS (SELECT 1 FROM scrape_runs
                     WHERE finished_at IS NULL AND started_at > now() - interval '2 hours') AS running
      FROM scrape_runs r
      WHERE r.finished_at IS NOT NULL
      ORDER BY r.started_at DESC LIMIT 1`);
    return res.rows[0] || null;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getAllSettings() {
    const res = await pool.query('SELECT key, value FROM settings');
    return Object.fromEntries(res.rows.map(r => [r.key, r.value]));
}

export async function getSetting(key) {
    const res = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return res.rows[0]?.value ?? null;
}

export async function upsertSetting(key, value) {
    await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, value]
    );
}

// ── Watched Companies ─────────────────────────────────────────────────────────

// ── H-1B employer filings (DOL LCA data, imported by scripts/import-h1b-lca.js) ──

/**
 * Replace the whole h1b_employers table in one transaction, so the site keeps
 * the previous data if an import fails halfway.
 */
export async function replaceH1bEmployers(rows) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM h1b_employers');
        for (let i = 0; i < rows.length; i += 5000) {
            const batch = rows.slice(i, i + 5000);
            await client.query(
                `INSERT INTO h1b_employers (key, display_name, filings, last_decision_date, fein_count, min_fy, max_fy)
                 SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::date[], $5::int[], $6::int[], $7::int[])`,
                [
                    batch.map(r => r.key), batch.map(r => r.display_name), batch.map(r => r.filings),
                    batch.map(r => r.last_decision_date), batch.map(r => r.fein_count),
                    batch.map(r => r.min_fy), batch.map(r => r.max_fy),
                ]
            );
        }
        await client.query(
            `INSERT INTO settings (key, value) VALUES ('h1b_imported_at', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [new Date().toISOString()]
        );
        await client.query('COMMIT');
        return rows.length;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function getH1bEmployers() {
    const res = await pool.query(
        `SELECT key, display_name, filings, to_char(last_decision_date, 'YYYY-MM-DD') AS last_decision_date,
                fein_count, min_fy, max_fy FROM h1b_employers`
    );
    return res.rows;
}

export async function getH1bMeta() {
    const res = await pool.query(`
      SELECT (SELECT value FROM settings WHERE key = 'h1b_imported_at') AS imported_at,
             MIN(min_fy) AS min_fy, MAX(max_fy) AS max_fy,
             to_char(MAX(last_decision_date), 'YYYY-MM-DD') AS latest_decision
      FROM h1b_employers`);
    const r = res.rows[0];
    return { imported_at: r.imported_at ?? null, min_fy: r.min_fy ?? null, max_fy: r.max_fy ?? null, latest_decision: r.latest_decision ?? null };
}

// ── Dead-board cache (wide sweep) ────────────────────────────────────────────
// A board that answers "gone" on DEAD_BOARD_MISSES sweeps in a row is skipped
// until DEAD_BOARD_RECHECK_DAYS have passed, then probed once more.
export const DEAD_BOARD_MISSES = 3;
export const DEAD_BOARD_RECHECK_DAYS = 30;

/** Boards to skip this sweep. */
export async function getDeadBoards(source) {
    const res = await pool.query(
        `SELECT board FROM dead_boards
         WHERE source = $1 AND misses >= $2 AND last_checked > now() - make_interval(days => $3::int)`,
        [source, DEAD_BOARD_MISSES, DEAD_BOARD_RECHECK_DAYS]
    );
    return new Set(res.rows.map(r => r.board));
}

/**
 * Record one sweep's outcomes: 'ok' clears a board's misses, 'gone' adds one,
 * 'unknown' (throttled, timed out, 5xx) changes nothing.
 */
export async function recordBoardResults(source, results) {
    const ok = results.filter(r => r.outcome === 'ok').map(r => r.board);
    const gone = results.filter(r => r.outcome === 'gone').map(r => r.board);
    if (ok.length) {
        await pool.query(`DELETE FROM dead_boards WHERE source = $1 AND board = ANY($2)`, [source, ok]);
    }
    if (gone.length) {
        await pool.query(
            `INSERT INTO dead_boards (source, board, misses, last_checked)
             SELECT $1, b, 1, now() FROM unnest($2::text[]) AS b
             ON CONFLICT (source, board) DO UPDATE
               SET misses = dead_boards.misses + 1, last_checked = now()`,
            [source, gone]
        );
    }
    return { cleared: ok.length, missed: gone.length };
}

/** Distinct company names among open feed jobs (for watchlist name matching). */
export async function getOpenCompanyNames() {
    const res = await pool.query(`SELECT DISTINCT company FROM jobs WHERE closed_at IS NULL AND us_ineligible IS NOT TRUE`);
    return res.rows.map(r => r.company);
}

/** Open feed jobs for any of the given exact company names. */
export async function getOpenJobsForCompanies(names) {
    if (!names.length) return [];
    const res = await pool.query(
        `SELECT id, title, url, location, posted_at, source FROM jobs
         WHERE company = ANY($1) AND closed_at IS NULL AND us_ineligible IS NOT TRUE`,
        [names]
    );
    return res.rows;
}

export async function getWatchedCompanies() {
    const res = await pool.query('SELECT * FROM watched_companies ORDER BY created_at DESC');
    return res.rows;
}

export async function getWatchedCompany(id) {
    const res = await pool.query('SELECT * FROM watched_companies WHERE id = $1', [id]);
    return res.rows[0] || null;
}

/** Insert a watched company, ignoring duplicates. Returns true if newly inserted. */
export async function insertWatchedCompany(c) {
    const res = await pool.query(
        `INSERT INTO watched_companies
           (id, name, domain, career_url, ats_type, ats_slug, watch_roles, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.name, c.domain ?? null, c.career_url ?? null, c.ats_type, c.ats_slug ?? null, c.watch_roles]
    );
    return res.rowCount > 0;
}

export async function deleteWatchedCompany(id) {
    await pool.query('DELETE FROM watched_companies WHERE id = $1', [id]);
}

export async function updateWatchedCompanyState({ last_job_hash, last_job_ids, active_jobs_count, id }) {
    await pool.query(
        `UPDATE watched_companies
         SET last_checked = now(), last_job_hash = $1, last_job_ids = $2,
             active_jobs_count = $3, status = 'active', error_msg = NULL
         WHERE id = $4`,
        [last_job_hash, last_job_ids, active_jobs_count, id]
    );
}

/** Persist a newly-discovered ATS for a company (e.g. found embedded in a custom page). */
export async function updateWatchedCompanyAts({ ats_type, ats_slug, career_url, id }) {
    await pool.query(
        `UPDATE watched_companies
         SET ats_type = $1, ats_slug = $2, career_url = COALESCE($3, career_url),
             status = 'active', error_msg = NULL
         WHERE id = $4`,
        [ats_type, ats_slug ?? null, career_url ?? null, id]
    );
}

export async function updateWatchedCompanyError(errorMsg, id) {
    await pool.query(
        `UPDATE watched_companies
         SET last_checked = now(), status = 'error', error_msg = $1
         WHERE id = $2`,
        [errorMsg, id]
    );
}

export async function incrementWatchNotifyCount(id) {
    await pool.query('UPDATE watched_companies SET notify_count = notify_count + 1 WHERE id = $1', [id]);
}

// ── Push Subscriptions ─────────────────────────────────────────────────────────

export async function insertPushSubscription({ endpoint, p256dh, auth }) {
    await pool.query(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
         VALUES ($1, $2, $3)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
        [endpoint, p256dh, auth]
    );
}

export async function deletePushSubscription(endpoint) {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function getAllPushSubscriptions() {
    const res = await pool.query('SELECT * FROM push_subscriptions');
    return res.rows;
}

// ── Watch Notifications Log ─────────────────────────────────────────────────────

export async function insertWatchNotification({ company_id, company_name, job_title, job_url }) {
    await pool.query(
        `INSERT INTO watch_notifications (company_id, company_name, job_title, job_url)
         VALUES ($1, $2, $3, $4)`,
        [company_id, company_name, job_title, job_url]
    );
}

export async function getRecentWatchNotifications() {
    const res = await pool.query('SELECT * FROM watch_notifications ORDER BY sent_at DESC LIMIT 20');
    return res.rows;
}

export default pool;
