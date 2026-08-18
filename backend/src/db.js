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
import { buildJobQueryFilters } from './utils/roleFilters.js';
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
    max: Number(process.env.PG_POOL_MAX || 5),
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
        const res = await pool.query(
            `INSERT INTO jobs (id, title, company, location, url, source, category, salary, description, posted_at, status, is_new, last_seen_at, missed_count, closed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',true, now(), 0, NULL)`,
            [
                job.id, job.title, job.company, job.location ?? null, job.url, job.source,
                job.category, job.salary ?? null, job.description ?? null, job.posted_at ?? null,
            ]
        );
        return res.rowCount > 0;
    }

    const existing = existingRes.rows[0];
    const oldPosted = parseTs(existing.posted_at);
    const newPosted = parseTs(job.posted_at);
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
               reposted_at = now(),
               scraped_at = now(),
               is_new = true,
               last_seen_at = CASE WHEN source = $10 THEN now() ELSE last_seen_at END,
               missed_count = CASE WHEN source = $10 THEN 0 ELSE missed_count END,
               closed_at = CASE WHEN source = $10 THEN NULL ELSE closed_at END
             WHERE url = $9`,
            [
                job.title,
                job.company,
                job.location ?? null,
                job.category,
                job.salary ?? null,
                job.description ?? null,
                job.posted_at ?? null,
                previousPosted,
                job.url,
                job.source,
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
           last_seen_at = CASE WHEN source = $9 THEN now() ELSE last_seen_at END,
           missed_count = CASE WHEN source = $9 THEN 0 ELSE missed_count END,
           closed_at = CASE WHEN source = $9 THEN NULL ELSE closed_at END
         WHERE url = $8`,
        [
            job.title,
            job.company,
            job.location ?? null,
            job.category,
            job.salary ?? null,
            job.description ?? null,
            job.posted_at ?? null,
            job.url,
            job.source,
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

const JOB_COLUMNS = `
  id, title, company, location, url, source, category, salary, description, notes,
  posted_at, previous_posted_at, reposted_at, scraped_at, applied_at, status, closed_at,
  is_new::int AS is_new,
  is_reposted::int AS is_reposted,
  (CASE WHEN scraped_at >= now() - interval '24 hours' THEN 1 ELSE 0 END) AS is_fresh
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
         ORDER BY scraped_at DESC, posted_at DESC NULLS LAST
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

export async function updateJobStatus(status, id) {
    const res = await pool.query(
        `UPDATE jobs
         SET status = $1,
             is_new = false,
             applied_at = CASE
               WHEN $1 = 'applied' AND applied_at IS NULL THEN now()
               ELSE applied_at
             END
         WHERE id = $2`,
        [status, id]
    );
    return res.rowCount;
}

export async function updateJobNotes(notes, id) {
    const res = await pool.query(
        'UPDATE jobs SET notes = $1 WHERE id = $2',
        [notes ?? null, id]
    );
    return res.rowCount;
}

export async function markAllSeen() {
    await pool.query('UPDATE jobs SET is_new = false WHERE is_new = true');
}

export async function getStats() {
    const res = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN is_new THEN 1 ELSE 0 END), 0)::int AS new_count,
        COALESCE(SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END), 0)::int AS count_new,
        COALESCE(SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END), 0)::int AS applied,
        COALESCE(SUM(CASE WHEN status = 'saved' THEN 1 ELSE 0 END), 0)::int AS saved,
        COALESCE(SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END), 0)::int AS ignored,
        COALESCE(SUM(CASE WHEN scraped_at >= now() - interval '24 hours' THEN 1 ELSE 0 END), 0)::int AS last_24h
      FROM jobs
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

export async function getLastScrapeRun() {
    const res = await pool.query('SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT 1');
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
         SET ats_type = $1, ats_slug = $2, career_url = COALESCE($3, career_url)
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
