# Fast ATS Polling + Ghost-Job Staleness Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every company in the 7 direct-ATS main-feed sources the same fast, diff-based polling the company watchlist already gives watched companies, and use that same diff to detect and hide closed listings.

**Architecture:** A new pure function (`staleness.js`) computes which previously-open jobs are missing from a fresh poll and whether they've crossed the close threshold. `db.js` gains 3 new `jobs` columns and a thin wrapper that calls the pure function and issues the UPDATEs. The 7 direct-ATS scraper modules change their return contract to also report which companies were successfully polled (so a failed fetch is never mistaken for "company has zero jobs now"). A new `fastPoll.js` orchestrates these 7 sources on a faster cadence, separate from the existing hourly hourly hourly `scraper.js` run which keeps the free job-board sources unchanged. `roleFilters.js` excludes closed jobs from the default feed unless the user already saved/applied to them.

**Tech Stack:** Node.js/Express (ESM), Postgres (`pg`), Vitest, Next.js/React frontend.

**Spec:** `docs/superpowers/specs/2026-08-17-fast-poll-staleness-design.md`

## Global Constraints

- Close threshold: a job is marked closed after **2 consecutive misses** (exact value from spec) — not on the first miss, to tolerate one transient fetch hiccup.
- Fast poll cadence: **every 15 minutes** (`*/15 * * * *`), matching the spec's "~15-20 min."
- The 7 direct-ATS sources in scope, with their exact `source` column values: `greenhouse`, `lever`, `ashby`, `workday`, `smartrecruiters`, `workable`, `recruitee`.
- **Out of scope** (per spec's Non-goals — do not add staleness detection or move to the fast cadence): `direct.js` ("Direct Pages"), `simplifyjobs.js`, `adzuna.js`, `remoteok.js`, `remotive.js`, `himalayas.js`, `weworkremotely.js`, `themuse.js`, `jobicy.js`, `jsearch.js`, `fantasticJobs.js`, `bigtech.js`, `platformSearch.js`. `companyWatcher.js` and its notification logic are not modified by any task in this plan.
- `polledCompanies` (the new field each of the 7 scrapers returns) must contain the exact `company` string used in each job's `company` field in that same run — not the ATS slug. This is what the closer sweep matches against the `jobs.company` column.
- A company counts as "successfully polled" once its HTTP response is `ok` and its JSON body parses — regardless of how many (even zero) eligible jobs it yields this run. A non-`ok` response (including 404) or a thrown error means the company is **excluded** from `polledCompanies` for this run, so a fetch failure is never mistaken for "this company now has zero jobs."
- **Never execute code paths that hit the live database during verification.** `backend/.env`'s `DATABASE_URL` points at this project's real production Supabase instance. Verification for every task is `npx vitest run` (with dependencies mocked, per the codebase's existing convention) and `node --check` for syntax — never `npm run scrape`, never calling `initDb()`/`runFastAtsPoll()`/`runScraper()` for real, never starting the server against the live database.
- No DB-integration automated tests for `db.js` — this matches the existing project convention (zero DB-integration tests exist today, and there's no test-database setup). `db.js` changes are verified via `node --check` and code review, not by executing queries against a real database. This exception is approved in the spec's Testing section.
- Commit messages: conventional commits (`feat:`/`fix:`/`docs:`/etc.), **no `Co-Authored-By` trailer** (standing project instruction).
- No feature flags, no backwards-compatibility shims for the old bare-array scraper return shape — every caller of the 7 changed scrapers is updated in the same task that changes the scraper, per YAGNI.

---

## Task 1: Pure staleness diff function

**Files:**
- Create: `backend/src/utils/staleness.js`
- Test: `backend/src/utils/staleness.test.js`

**Interfaces:**
- Produces: `computeStaleUpdates(existingOpenJobs, freshUrls, missThreshold = 2)` where `existingOpenJobs` is `{ id: string, url: string, missed_count: number }[]` (rows already filtered by the caller to `closed_at IS NULL` for one source + polled-companies set) and `freshUrls` is a `Set<string>`. Returns `{ toIncrement: string[], toClose: string[] }` — arrays of `id`s. A row present in `freshUrls` appears in neither array (it's handled elsewhere, via `insertJob`). A row absent from `freshUrls` goes to `toClose` when `missed_count + 1 >= missThreshold`, otherwise to `toIncrement`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { computeStaleUpdates } from './staleness.js';

describe('computeStaleUpdates', () => {
    it('leaves a job alone when its URL is in freshUrls', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 0 }];
        const fresh = new Set(['https://x/a']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh);

        expect(toIncrement).toEqual([]);
        expect(toClose).toEqual([]);
    });

    it('increments a missing job that has not yet hit the threshold', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 0 }];
        const fresh = new Set(['https://x/b']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toIncrement).toEqual(['a']);
        expect(toClose).toEqual([]);
    });

    it('closes a missing job once missed_count + 1 reaches the threshold', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 1 }];
        const fresh = new Set(['https://x/b']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toIncrement).toEqual([]);
        expect(toClose).toEqual(['a']);
    });

    it('closes a missing job that is already past the threshold', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 5 }];
        const fresh = new Set(['https://x/b']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toClose).toEqual(['a']);
    });

    it('handles a mix of seen, incrementing, and closing jobs in one call', () => {
        const existing = [
            { id: 'seen', url: 'https://x/seen', missed_count: 0 },
            { id: 'first-miss', url: 'https://x/first-miss', missed_count: 0 },
            { id: 'second-miss', url: 'https://x/second-miss', missed_count: 1 },
        ];
        const fresh = new Set(['https://x/seen']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toIncrement).toEqual(['first-miss']);
        expect(toClose).toEqual(['second-miss']);
    });

    it('returns empty arrays when there are no existing open jobs', () => {
        const { toIncrement, toClose } = computeStaleUpdates([], new Set(['https://x/a']));
        expect(toIncrement).toEqual([]);
        expect(toClose).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/utils/staleness.test.js`
Expected: FAIL — `Cannot find module './staleness.js'`

- [ ] **Step 3: Write the minimal implementation**

```js
/**
 * Pure diff logic for detecting closed job listings.
 *
 * Given the currently-open DB rows for one source + one poll's set of polled
 * companies, and the URLs that poll actually found, decides which rows are
 * still missing and whether they've crossed the close threshold. Contains
 * no I/O — db.js's closeStaleJobs() is the thin wrapper that fetches rows,
 * calls this, and issues the UPDATE.
 */
export function computeStaleUpdates(existingOpenJobs, freshUrls, missThreshold = 2) {
    const toIncrement = [];
    const toClose = [];

    for (const job of existingOpenJobs) {
        if (freshUrls.has(job.url)) continue;

        if (job.missed_count + 1 >= missThreshold) {
            toClose.push(job.id);
        } else {
            toIncrement.push(job.id);
        }
    }

    return { toIncrement, toClose };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/utils/staleness.test.js`
Expected: PASS — 6/6 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/staleness.js backend/src/utils/staleness.test.js
git commit -m "feat: add pure staleness diff function for ghost-job detection"
```

---

## Task 2: Schema migration, insertJob "seen" tracking, and closeStaleJobs

**Files:**
- Modify: `backend/src/db.js`

**Interfaces:**
- Consumes: `computeStaleUpdates(existingOpenJobs, freshUrls, missThreshold)` from Task 1 (`./utils/staleness.js`, note `db.js` is one level up from `utils/`).
- Produces: `closeStaleJobs(source: string, polledCompanies: string[], freshUrls: string[]) => Promise<{ closed: number, incremented: number }>` — consumed by `fastPoll.js` in Task 6.
- `insertJob(job)` keeps its existing signature and return type (`Promise<boolean>`); its three write paths now also set `last_seen_at`, `missed_count`, `closed_at`.

No automated test for this task — see Global Constraints (no DB-integration tests; this exception is spec-approved). Verify with `node --check` and a careful read-through of the diff against the steps below.

- [ ] **Step 1: Add the three new columns to the schema migration**

In `backend/src/db.js`, inside `initDb()`, add three lines alongside the existing `ALTER TABLE` migrations (right after the `previous_posted_at` line):

```js
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS missed_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`);
```

- [ ] **Step 2: Import computeStaleUpdates**

At the top of `backend/src/db.js`, alongside the existing `buildJobQueryFilters` import:

```js
import { computeStaleUpdates } from './utils/staleness.js';
```

- [ ] **Step 3: Update insertJob's three write paths to track "seen"**

In `insertJob(job)`, the INSERT path (new job) becomes:

```js
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
```

The repost UPDATE path adds `last_seen_at = now(), missed_count = 0, closed_at = NULL,` to its SET clause:

```js
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
               last_seen_at = now(),
               missed_count = 0,
               closed_at = NULL
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
            ]
        );
        return true;
    }
```

The plain UPDATE path (not a repost — job still there, unchanged) also adds the same three fields:

```js
    await pool.query(
        `UPDATE jobs SET
           title = $1,
           company = $2,
           location = $3,
           category = $4,
           salary = $5,
           description = COALESCE($6, description),
           posted_at = COALESCE($7, posted_at),
           last_seen_at = now(),
           missed_count = 0,
           closed_at = NULL
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
        ]
    );
    return false;
```

- [ ] **Step 4: Add closeStaleJobs**

Add this function to `backend/src/db.js`, near `insertJob` (after it, before the `JOB_COLUMNS` section):

```js
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
```

- [ ] **Step 5: Verify syntax**

Run: `cd backend && node --check src/db.js`
Expected: no output (success)

- [ ] **Step 6: Commit**

```bash
git add backend/src/db.js
git commit -m "feat: add last_seen_at/missed_count/closed_at tracking and closeStaleJobs"
```

---

## Task 3: Greenhouse and Lever — report polledCompanies

**Files:**
- Modify: `backend/src/scrapers/greenhouse.js`
- Modify: `backend/src/scrapers/lever.js`
- Test: `backend/src/scrapers/greenhouse.test.js` (new)
- Test: `backend/src/scrapers/lever.test.js` (new)

**Interfaces:**
- Produces (both): `scrapeGreenhouse(filterSenior, extraCompanies) => Promise<{ jobs: Job[], polledCompanies: string[] }>`, `scrapeLever(filterSenior, extraCompanies) => Promise<{ jobs: Job[], polledCompanies: string[] }>`. `polledCompanies` holds the exact `company` string set on each returned job (the capitalized/formatted name, not the raw slug), for companies whose fetch succeeded this run.
- Consumed by: `fastPoll.js` in Task 6.

- [ ] **Step 1: Write the failing tests**

`backend/src/scrapers/greenhouse.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeGreenhouse } from './greenhouse.js';

function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('scrapeGreenhouse', () => {
    it('includes a company in polledCompanies when its fetch succeeds, using the formatted company name', async () => {
        mockFetch(async () => ({
            ok: true,
            json: async () => ({
                jobs: [{
                    id: 1, title: 'Software Engineer',
                    absolute_url: 'https://boards.greenhouse.io/testco/jobs/1',
                    location: { name: 'Remote' }, updated_at: '2026-01-01T00:00:00.000Z',
                }],
            }),
        }));

        const { jobs, polledCompanies } = await scrapeGreenhouse(true, ['testco']);

        expect(polledCompanies).toContain('Testco');
        expect(jobs[0].company).toBe('Testco');
    });

    it('excludes a company from polledCompanies when its fetch returns a non-OK response', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { jobs, polledCompanies } = await scrapeGreenhouse(true, ['broken']);

        expect(polledCompanies).not.toContain('Broken');
        expect(jobs).toEqual([]);
    });

    it('excludes a company from polledCompanies when its fetch throws', async () => {
        mockFetch(async () => { throw new Error('network error'); });

        const { polledCompanies } = await scrapeGreenhouse(true, ['broken']);

        expect(polledCompanies).not.toContain('Broken');
    });

    it('still includes a company in polledCompanies even when it has zero matching jobs this run', async () => {
        mockFetch(async () => ({ ok: true, json: async () => ({ jobs: [] }) }));

        const { jobs, polledCompanies } = await scrapeGreenhouse(true, ['quietco']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('Quietco');
    });
});
```

`backend/src/scrapers/lever.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeLever } from './lever.js';

function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('scrapeLever', () => {
    it('includes a company in polledCompanies when its fetch succeeds, using the formatted company name', async () => {
        mockFetch(async () => ({
            ok: true,
            json: async () => ([{
                id: 'abc', text: 'Backend Engineer',
                hostedUrl: 'https://jobs.lever.co/test-co/abc',
                categories: { location: 'Remote' }, createdAt: 1735689600000,
            }]),
        }));

        const { jobs, polledCompanies } = await scrapeLever(true, ['test-co']);

        expect(polledCompanies).toContain('Test Co');
        expect(jobs[0].company).toBe('Test Co');
    });

    it('excludes a company from polledCompanies when its fetch returns a non-OK response', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { polledCompanies } = await scrapeLever(true, ['broken']);

        expect(polledCompanies).not.toContain('Broken');
    });

    it('excludes a company from polledCompanies when the response body is not an array', async () => {
        mockFetch(async () => ({ ok: true, json: async () => ({ not: 'an array' }) }));

        const { polledCompanies } = await scrapeLever(true, ['weird']);

        expect(polledCompanies).not.toContain('Weird');
    });

    it('still includes a company in polledCompanies even when it has zero matching jobs this run', async () => {
        mockFetch(async () => ({ ok: true, json: async () => ([]) }));

        const { jobs, polledCompanies } = await scrapeLever(true, ['quiet-co']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('Quiet Co');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/scrapers/greenhouse.test.js src/scrapers/lever.test.js`
Expected: FAIL — `scrapeGreenhouse`/`scrapeLever` currently return a bare array, so `.polledCompanies` is `undefined` and the `toContain` assertions fail (`TypeError: Cannot read properties of undefined`)

- [ ] **Step 3: Update scrapeGreenhouse**

In `backend/src/scrapers/greenhouse.js`, replace the function body:

```js
export async function scrapeGreenhouse(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const allCompanies = [...new Set([...GREENHOUSE_COMPANIES, ...extraCompanies])];

    for (const company of allCompanies) {
        try {
            const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️  Greenhouse ${company}: HTTP ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const allJobs = data.jobs || [];
            const companyName = company.charAt(0).toUpperCase() + company.slice(1);
            polledCompanies.push(companyName);

            let companyCount = 0;
            for (const job of allJobs) {
                const title = job.title || '';
                const description = job.content ? job.content.replace(/<[^>]*>/g, '').slice(0, 500) : '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = job.absolute_url || `https://boards.greenhouse.io/${company}/jobs/${job.id}`;
                const location = job.location?.name || 'Remote/Unknown';
                const postedAt = job.updated_at ? new Date(job.updated_at).toISOString() : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: companyName,
                    location,
                    url: jobUrl,
                    source: 'greenhouse',
                    category,
                    salary: null,
                    description: description || null,
                    posted_at: postedAt,
                });
                companyCount++;
            }

            if (allJobs.length > 0) {
                console.log(`✅ Greenhouse [${company}]: ${companyCount} tech roles (${allJobs.length} total)`);
            }
            await sleep(300); // Be polite to the API
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Greenhouse [${company}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
```

- [ ] **Step 4: Update scrapeLever**

In `backend/src/scrapers/lever.js`, replace the function body:

```js
export async function scrapeLever(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const allCompanies = [...new Set([...LEVER_COMPANIES, ...extraCompanies])];

    for (const company of allCompanies) {
        try {
            const url = `https://api.lever.co/v0/postings/${company}?mode=json&commitment=fulltime`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️ Lever ${company}: HTTP ${resp.status}`);
                continue;
            }

            const postings = await resp.json();
            if (!Array.isArray(postings)) continue;

            const companyName = company.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            polledCompanies.push(companyName);

            let companyCount = 0;
            for (const posting of postings) {
                const title = posting.text || '';
                const description = posting.descriptionPlain?.slice(0, 500) || '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = posting.hostedUrl || `https://jobs.lever.co/${company}/${posting.id}`;
                const location = posting.categories?.location || posting.workplaceType || 'Remote/US';
                const postedAt = posting.createdAt
                    ? new Date(posting.createdAt).toISOString()
                    : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: companyName,
                    location,
                    url: jobUrl,
                    source: 'lever',
                    category,
                    salary: null,
                    description: description || null,
                    posted_at: postedAt,
                });
                companyCount++;
            }

            if (postings.length) {
                console.log(`✅ Lever [${company}]: ${companyCount} tech roles (${postings.length} total)`);
            }
            await sleep(300);
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Lever [${company}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/scrapers/greenhouse.test.js src/scrapers/lever.test.js`
Expected: PASS — 8/8 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/scrapers/greenhouse.js backend/src/scrapers/greenhouse.test.js backend/src/scrapers/lever.js backend/src/scrapers/lever.test.js
git commit -m "feat: report polledCompanies from Greenhouse and Lever scrapers"
```

---

## Task 4: Ashby and Workday — report polledCompanies

**Files:**
- Modify: `backend/src/scrapers/ashby.js`
- Modify: `backend/src/scrapers/workday.js`
- Test: `backend/src/scrapers/ashby.test.js` (new)
- Test: `backend/src/scrapers/workday.test.js` (new)

**Interfaces:**
- Produces (both): same `{ jobs: Job[], polledCompanies: string[] }` shape as Task 3.
- Consumed by: `fastPoll.js` in Task 6.

- [ ] **Step 1: Write the failing tests**

`backend/src/scrapers/ashby.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeAshby } from './ashby.js';

function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('scrapeAshby', () => {
    it('includes a company in polledCompanies when its fetch succeeds', async () => {
        mockFetch(async (url) => {
            if (String(url).includes('anyscale')) {
                return {
                    ok: true,
                    json: async () => ({
                        jobs: [{
                            id: 'j1', title: 'ML Engineer', isListed: true,
                            jobUrl: 'https://jobs.ashbyhq.com/anyscale/j1',
                            publishedAt: '2026-01-01T00:00:00.000Z',
                        }],
                    }),
                };
            }
            return { ok: false, status: 404 };
        });

        const { jobs, polledCompanies } = await scrapeAshby(true, []);

        expect(polledCompanies).toContain('Anyscale');
        expect(jobs.some(j => j.company === 'Anyscale')).toBe(true);
    });

    it('excludes a company from polledCompanies when its fetch fails', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { polledCompanies } = await scrapeAshby(true, ['brand-new-co']);

        expect(polledCompanies).not.toContain('brand-new-co');
    });

    it('still includes a company in polledCompanies with zero matching jobs this run', async () => {
        mockFetch(async (url) => (String(url).includes('quietco')
            ? { ok: true, json: async () => ({ jobs: [] }) }
            : { ok: false, status: 404 }));

        const { jobs, polledCompanies } = await scrapeAshby(true, ['quietco']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('quietco');
    });
});
```

`backend/src/scrapers/workday.test.js`:

Note: `scrapeWorkday` calls `await sleep(600)` after every company's `fetchWorkdayJobs()` call returns — including on failure, since `fetchWorkdayJobs` catches its own errors internally and returns `[]` rather than throwing (see the Note after Step 4 below). With 16 hardcoded `WORKDAY_COMPANIES`, that's 16 × 600ms ≈ 9.6s if `sleep` isn't mocked — over vitest's default 5s test timeout regardless of which companies succeed or fail. Mock `sleep` to resolve instantly, the same fix Task 3 needed for Greenhouse/Lever's larger company lists.

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeWorkday } from './workday.js';

vi.mock('../utils/helpers.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, sleep: vi.fn().mockResolvedValue(undefined) };
});

function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('scrapeWorkday', () => {
    it('includes a company in polledCompanies when at least one search term succeeds', async () => {
        mockFetch(async (url) => {
            if (String(url).includes('salesforce.wd12')) {
                return {
                    ok: true,
                    json: async () => ({
                        jobPostings: [{
                            title: 'Software Engineer',
                            externalPath: '/job/123',
                            locationsText: 'San Francisco, CA',
                        }],
                    }),
                };
            }
            return { ok: false, status: 500 };
        });

        const { jobs, polledCompanies } = await scrapeWorkday(true);

        expect(polledCompanies).toContain('Salesforce');
        expect(jobs.some(j => j.company === 'Salesforce')).toBe(true);
    });

    it('excludes a company from polledCompanies when every request fails', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { jobs, polledCompanies } = await scrapeWorkday(true);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/scrapers/ashby.test.js src/scrapers/workday.test.js`
Expected: FAIL — both currently return a bare array

- [ ] **Step 3: Update scrapeAshby**

In `backend/src/scrapers/ashby.js`, replace the function body:

```js
export async function scrapeAshby(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const extraObjs = extraCompanies.map(slug => ({ slug, name: slug }));
    const allCompanies = [
        ...ASHBY_COMPANIES,
        ...extraObjs.filter(e => !ASHBY_COMPANIES.some(a => a.slug === e.slug)),
    ];

    for (const company of allCompanies) {
        try {
            const url = `${ASHBY_API}/${company.slug}`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️  Ashby ${company.slug}: HTTP ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const postings = data.jobs || data.jobPostings || [];
            polledCompanies.push(company.name);
            let companyCount = 0;

            for (const posting of postings) {
                if (posting.isListed === false) continue;
                const title = posting.title || '';
                const description = posting.descriptionPlain || posting.descriptionHtml || '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = posting.jobUrl || `https://jobs.ashbyhq.com/${company.slug}/${posting.id}`;
                const location = posting.location || posting.locationName || posting.workplaceType || 'Remote/US';
                const postedAt = posting.publishedAt
                    ? new Date(posting.publishedAt).toISOString()
                    : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: company.name,
                    location,
                    url: jobUrl,
                    source: 'ashby',
                    category,
                    salary: posting.compensation?.scrapeableCompensationSalarySummary || null,
                    description: posting.descriptionPlain || null,
                    posted_at: postedAt,
                });
                companyCount++;
            }

            if (postings.length > 0) {
                console.log(`✅ Ashby [${company.name}]: ${companyCount} tech roles (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ Ashby [${company.name}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
```

- [ ] **Step 4: Update scrapeWorkday**

In `backend/src/scrapers/workday.js`, replace the `scrapeWorkday` function body (leave `fetchWorkdayJobs` untouched):

```js
export async function scrapeWorkday(filterSenior = true) {
    const jobs = [];
    const polledCompanies = [];

    for (const { company, careerUrl } of WORKDAY_COMPANIES) {
        try {
            const wd = parseWorkdayUrl(careerUrl);
            if (!wd) continue;

            const postings = await fetchWorkdayJobs(company, careerUrl);
            polledCompanies.push(company);

            for (const posting of postings) {
                const title = posting.title || '';
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = `https://${wd.host}${posting.externalPath}`;
                const category = classifyCategory(title);
                if (!category) continue;

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company,
                    location: posting.locationsText || 'United States',
                    url: jobUrl,
                    source: 'workday',
                    category,
                    salary: null,
                    description: null,
                    posted_at: new Date().toISOString(),
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Workday [${company}]: ${postings.length} postings`);
            }
            await sleep(600);
        } catch (err) {
            console.error(`❌ Workday [${company}]: ${err.message}`);
        }
    }

    return { jobs, polledCompanies };
}
```

Note: `fetchWorkdayJobs` already returns `[]` (not a throw) when every search term's request fails (it `break`s out of the term loop on a non-`ok` response or a caught error, leaving `allJobs` at whatever it had accumulated — `[]` if the very first term failed). Since `scrapeWorkday` pushes to `polledCompanies` unconditionally whenever `fetchWorkdayJobs` returns without throwing, a company whose *first* term fails but whose connection is otherwise fine will still count as "polled" with zero jobs — this is an intentional, acceptable trade-off given Workday's endpoint is one shared endpoint per company (not per-term), so a first-term failure almost always means the whole endpoint is down, in which case zero jobs found this run is roughly accurate anyway.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/scrapers/ashby.test.js src/scrapers/workday.test.js`
Expected: PASS — 5/5 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/scrapers/ashby.js backend/src/scrapers/ashby.test.js backend/src/scrapers/workday.js backend/src/scrapers/workday.test.js
git commit -m "feat: report polledCompanies from Ashby and Workday scrapers"
```

---

## Task 5: SmartRecruiters, Workable, Recruitee — report polledCompanies

**Files:**
- Modify: `backend/src/scrapers/smartrecruiters.js`
- Modify: `backend/src/scrapers/workable.js`
- Modify: `backend/src/scrapers/recruitee.js`
- Modify: `backend/src/scrapers/smartrecruiters.test.js` (existing tests currently assert a bare array — need updating)
- Modify: `backend/src/scrapers/workable.test.js` (same)
- Modify: `backend/src/scrapers/recruitee.test.js` (same)

**Interfaces:**
- Produces (all three): same `{ jobs: Job[], polledCompanies: string[] }` shape as Tasks 3-4.
- Consumed by: `fastPoll.js` in Task 6.

These three already have test coverage from the earlier ATS-coverage-broadening work. Every existing test in these three files currently destructures the return value as `const jobs = await scrapeX(...)` and asserts against `jobs` directly — all of those need to change to `const { jobs } = await scrapeX(...)`, plus one new test per file for the `polledCompanies` contract.

- [ ] **Step 1: Update the failing/changing tests in smartrecruiters.test.js**

In `backend/src/scrapers/smartrecruiters.test.js`, change every `const jobs = await scrapeSmartRecruiters(...)` to `const { jobs } = await scrapeSmartRecruiters(...)`, and add:

```js
    it('includes a company in polledCompanies when its fetch succeeds, excludes it when the fetch throws', async () => {
        vi.mocked(fetchSmartRecruiters).mockImplementation(async (s) => {
            if (s === 'broken') throw new Error('SmartRecruiters HTTP 500');
            if (s === 'testco') {
                return [{
                    id: 'ok1', title: 'Backend Engineer', url: 'https://x', location: 'US',
                    posted_at: 'now', source: 'smartrecruiters',
                }];
            }
            return [];
        });

        const { polledCompanies } = await scrapeSmartRecruiters(true, ['broken', 'testco']);

        expect(polledCompanies).toContain('testco');
        expect(polledCompanies).not.toContain('broken');
    });

    it('includes a company in polledCompanies even with zero postings this run', async () => {
        vi.mocked(fetchSmartRecruiters).mockResolvedValue([]);

        const { jobs, polledCompanies } = await scrapeSmartRecruiters(true, ['quietco']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('quietco');
    });
```

Apply the same two changes (destructure `{ jobs }`, add the two `polledCompanies` tests with the fetcher name swapped) to `backend/src/scrapers/workable.test.js` (using `fetchWorkable`, slugs `'broken'`/`'testco'`/`'quietco'`) and `backend/src/scrapers/recruitee.test.js` (using `fetchRecruitee`, same slugs).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/scrapers/smartrecruiters.test.js src/scrapers/workable.test.js src/scrapers/recruitee.test.js`
Expected: FAIL — existing assertions like `expect(jobs).toContainEqual(...)` now receive `{jobs: [...], polledCompanies: undefined}` instead of the array itself, and the new `polledCompanies` tests fail since the field doesn't exist yet

- [ ] **Step 3: Update scrapeSmartRecruiters**

In `backend/src/scrapers/smartrecruiters.js`, replace the function body:

```js
export async function scrapeSmartRecruiters(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const allCompanies = mergeCompanies(SMARTRECRUITERS_COMPANIES, extraCompanies);

    for (const company of allCompanies) {
        try {
            const postings = await fetchPostings(company.slug);
            polledCompanies.push(company.name);

            for (const posting of postings) {
                // Title-only classification: the shared fetcher doesn't carry a
                // description field for this ATS, so ambiguous titles that Ashby's
                // richer payload would resolve via description are dropped here instead.
                const category = classifyCategory(posting.title);
                if (!category) continue;
                if (filterSenior && isSeniorRole(posting.title)) continue;

                jobs.push({
                    id: posting.id,
                    title: posting.title,
                    company: company.name,
                    location: posting.location,
                    url: posting.url,
                    source: 'smartrecruiters',
                    category,
                    salary: null,
                    description: null,
                    posted_at: posting.posted_at,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ SmartRecruiters [${company.name}]: ${jobs.length} tech roles so far (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ SmartRecruiters [${company.name}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
```

- [ ] **Step 4: Update scrapeWorkable**

In `backend/src/scrapers/workable.js`, replace the function body:

```js
export async function scrapeWorkable(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const allCompanies = mergeCompanies(WORKABLE_COMPANIES, extraCompanies);

    for (const company of allCompanies) {
        try {
            const postings = await fetchPostings(company.slug);
            polledCompanies.push(company.name);

            for (const posting of postings) {
                // Title-only classification: the shared fetcher doesn't carry a
                // description field for this ATS, so ambiguous titles that Ashby's
                // richer payload would resolve via description are dropped here instead.
                const category = classifyCategory(posting.title);
                if (!category) continue;
                if (filterSenior && isSeniorRole(posting.title)) continue;

                jobs.push({
                    id: posting.id,
                    title: posting.title,
                    company: company.name,
                    location: posting.location,
                    url: posting.url,
                    source: 'workable',
                    category,
                    salary: null,
                    description: null,
                    posted_at: posting.posted_at,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Workable [${company.name}]: ${jobs.length} tech roles so far (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ Workable [${company.name}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
```

- [ ] **Step 5: Update scrapeRecruitee**

In `backend/src/scrapers/recruitee.js`, replace the function body:

```js
export async function scrapeRecruitee(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const extraObjs = extraCompanies.map(slug => ({ slug, name: slug }));
    const allCompanies = [
        ...RECRUITEE_COMPANIES,
        ...extraObjs.filter(e => !RECRUITEE_COMPANIES.some(c => c.slug === e.slug)),
    ];

    for (const company of allCompanies) {
        try {
            const postings = await fetchPostings(company.slug);
            polledCompanies.push(company.name);

            for (const posting of postings) {
                // Title-only classification: the shared fetcher doesn't carry a
                // description field for this ATS, so ambiguous titles that Ashby's
                // richer payload would resolve via description are dropped here instead.
                const category = classifyCategory(posting.title);
                if (!category) continue;
                if (filterSenior && isSeniorRole(posting.title)) continue;

                jobs.push({
                    id: posting.id,
                    title: posting.title,
                    company: company.name,
                    location: posting.location,
                    url: posting.url,
                    source: 'recruitee',
                    category,
                    salary: null,
                    description: null,
                    posted_at: posting.posted_at,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Recruitee [${company.name}]: ${jobs.length} tech roles so far (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ Recruitee [${company.name}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
```

Note: `recruitee.js` does not use `mergeCompanies` (only `smartrecruiters.js` and `workable.js` needed the case-insensitive dedup fix, since Recruitee slugs are already lowercased at discovery time) — its company-merging stays as the plain filter-based dedup shown above, unchanged from before this task.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/scrapers/smartrecruiters.test.js src/scrapers/workable.test.js src/scrapers/recruitee.test.js`
Expected: PASS — all tests in all three files

- [ ] **Step 7: Run the full backend suite to confirm no regressions**

Run: `cd backend && npx vitest run`
Expected: PASS — every test file

- [ ] **Step 8: Commit**

```bash
git add backend/src/scrapers/smartrecruiters.js backend/src/scrapers/smartrecruiters.test.js backend/src/scrapers/workable.js backend/src/scrapers/workable.test.js backend/src/scrapers/recruitee.js backend/src/scrapers/recruitee.test.js
git commit -m "feat: report polledCompanies from SmartRecruiters, Workable, Recruitee scrapers"
```

---

## Task 6: fastPoll.js orchestrator, and remove the 7 ATS scrapers from the hourly run

**Files:**
- Create: `backend/src/fastPoll.js`
- Test: `backend/src/fastPoll.test.js`
- Modify: `backend/src/scraper.js` (remove the 7 ATS scrapers — they're now exclusively owned by `fastPoll.js`)

**Interfaces:**
- Consumes: `scrapeGreenhouse`, `scrapeLever`, `scrapeAshby`, `scrapeWorkday`, `scrapeSmartRecruiters`, `scrapeWorkable`, `scrapeRecruitee` (all now `{jobs, polledCompanies}`-returning, from Tasks 3-5); `discoverATSCompanies()` from `discoverCompanies.js`; `insertJob`, `closeStaleJobs`, `getAllSettings` from `db.js` (Task 2); `isEligibleJob` from `helpers.js`.
- Produces: `runFastAtsPoll() => Promise<{ totalFound: number, totalNew: number, errors: string[] }>` — consumed by `scheduler.js` in Task 7.

- [ ] **Step 1: Write the failing tests**

`backend/src/fastPoll.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./scrapers/greenhouse.js', () => ({ scrapeGreenhouse: vi.fn() }));
vi.mock('./scrapers/lever.js', () => ({ scrapeLever: vi.fn() }));
vi.mock('./scrapers/ashby.js', () => ({ scrapeAshby: vi.fn() }));
vi.mock('./scrapers/workday.js', () => ({ scrapeWorkday: vi.fn() }));
vi.mock('./scrapers/smartrecruiters.js', () => ({ scrapeSmartRecruiters: vi.fn() }));
vi.mock('./scrapers/workable.js', () => ({ scrapeWorkable: vi.fn() }));
vi.mock('./scrapers/recruitee.js', () => ({ scrapeRecruitee: vi.fn() }));
vi.mock('./utils/discoverCompanies.js', () => ({ discoverATSCompanies: vi.fn() }));
vi.mock('./db.js', () => ({
    insertJob: vi.fn(),
    closeStaleJobs: vi.fn(),
    getAllSettings: vi.fn(),
}));

import { scrapeGreenhouse } from './scrapers/greenhouse.js';
import { scrapeLever } from './scrapers/lever.js';
import { scrapeAshby } from './scrapers/ashby.js';
import { scrapeWorkday } from './scrapers/workday.js';
import { scrapeSmartRecruiters } from './scrapers/smartrecruiters.js';
import { scrapeWorkable } from './scrapers/workable.js';
import { scrapeRecruitee } from './scrapers/recruitee.js';
import { discoverATSCompanies } from './utils/discoverCompanies.js';
import { insertJob, closeStaleJobs, getAllSettings } from './db.js';
import { runFastAtsPoll } from './fastPoll.js';

const EMPTY = { jobs: [], polledCompanies: [] };

function mockAllEmpty() {
    vi.mocked(scrapeGreenhouse).mockResolvedValue(EMPTY);
    vi.mocked(scrapeLever).mockResolvedValue(EMPTY);
    vi.mocked(scrapeAshby).mockResolvedValue(EMPTY);
    vi.mocked(scrapeWorkday).mockResolvedValue(EMPTY);
    vi.mocked(scrapeSmartRecruiters).mockResolvedValue(EMPTY);
    vi.mocked(scrapeWorkable).mockResolvedValue(EMPTY);
    vi.mocked(scrapeRecruitee).mockResolvedValue(EMPTY);
}

describe('runFastAtsPoll', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAllEmpty();
        vi.mocked(discoverATSCompanies).mockResolvedValue({
            greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workable: [], recruitee: [],
        });
        vi.mocked(getAllSettings).mockResolvedValue({ filter_exclude_senior: 'true' });
        vi.mocked(insertJob).mockResolvedValue(true);
        vi.mocked(closeStaleJobs).mockResolvedValue({ closed: 0, incremented: 0 });
    });

    it('inserts eligible jobs and calls closeStaleJobs with the source, polledCompanies, and fresh URLs', async () => {
        vi.mocked(scrapeGreenhouse).mockResolvedValue({
            jobs: [{
                id: 'gh1', title: 'Software Engineer', company: 'Testco', location: 'Remote, US',
                url: 'https://boards.greenhouse.io/testco/jobs/1', source: 'greenhouse',
                category: 'swe', salary: null, description: null, posted_at: '2026-01-01T00:00:00.000Z',
            }],
            polledCompanies: ['Testco'],
        });

        const result = await runFastAtsPoll();

        expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'gh1' }));
        expect(closeStaleJobs).toHaveBeenCalledWith(
            'greenhouse',
            ['Testco'],
            ['https://boards.greenhouse.io/testco/jobs/1']
        );
        expect(result.totalFound).toBe(1);
        expect(result.totalNew).toBe(1);
    });

    it('includes a job in the freshUrls passed to closeStaleJobs even when it fails eligibility filtering', async () => {
        vi.mocked(scrapeLever).mockResolvedValue({
            jobs: [{
                id: 'lv1', title: 'Software Engineer', company: 'Testco', location: 'Berlin, Germany',
                url: 'https://jobs.lever.co/testco/1', source: 'lever',
                category: 'swe', salary: null, description: null, posted_at: '2026-01-01T00:00:00.000Z',
            }],
            polledCompanies: ['Testco'],
        });

        await runFastAtsPoll();

        expect(insertJob).not.toHaveBeenCalled();
        expect(closeStaleJobs).toHaveBeenCalledWith(
            'lever',
            ['Testco'],
            ['https://jobs.lever.co/testco/1']
        );
    });

    it('continues past a source whose scraper throws, and still runs the others', async () => {
        vi.mocked(scrapeAshby).mockRejectedValue(new Error('Ashby is down'));

        const result = await runFastAtsPoll();

        expect(result.errors.some(e => e.includes('Ashby'))).toBe(true);
        expect(closeStaleJobs).toHaveBeenCalledWith('greenhouse', [], []);
        expect(closeStaleJobs).toHaveBeenCalledWith('workday', [], []);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/fastPoll.test.js`
Expected: FAIL — `Cannot find module './fastPoll.js'`

- [ ] **Step 3: Write fastPoll.js**

```js
/**
 * Fast ATS Poll
 *
 * Polls the 7 direct-ATS sources (Greenhouse, Lever, Ashby, Workday,
 * SmartRecruiters, Workable, Recruitee) on a faster cadence than the main
 * scraper, and runs the staleness "closer" sweep after each — the same
 * diff-based mechanism the company watchlist already uses for watched
 * companies, generalized here to every company across these sources.
 */

import { scrapeGreenhouse } from './scrapers/greenhouse.js';
import { scrapeLever } from './scrapers/lever.js';
import { scrapeAshby } from './scrapers/ashby.js';
import { scrapeWorkday } from './scrapers/workday.js';
import { scrapeSmartRecruiters } from './scrapers/smartrecruiters.js';
import { scrapeWorkable } from './scrapers/workable.js';
import { scrapeRecruitee } from './scrapers/recruitee.js';
import { discoverATSCompanies } from './utils/discoverCompanies.js';
import { insertJob, closeStaleJobs, getAllSettings } from './db.js';
import { isEligibleJob } from './utils/helpers.js';

async function saveAndClose(name, source, { jobs, polledCompanies }) {
    let newCount = 0;
    const seen = new Set();
    for (const job of jobs) {
        if (!isEligibleJob(job)) continue;
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        try {
            if (await insertJob(job)) newCount++;
        } catch (err) {
            console.error(`DB insert error [${name}]: ${err.message}`);
        }
    }

    // freshUrls comes from the FULL jobs list, not the eligibility-filtered
    // subset — a job that's still on the board but newly fails our own
    // eligibility filters (e.g. its location text changed) must never be
    // mistaken for a closed listing.
    const freshUrls = jobs.map(j => j.url);
    const { closed } = await closeStaleJobs(source, polledCompanies, freshUrls);
    if (closed > 0) console.log(`🔒 ${name}: ${closed} listing(s) marked closed`);

    return { found: jobs.length, newCount };
}

export async function runFastAtsPoll() {
    const settings = await getAllSettings();
    const filterSenior = settings.filter_exclude_senior !== 'false';

    const discovered = await discoverATSCompanies().catch(() => ({
        greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workable: [], recruitee: [],
    }));

    const sources = [
        { name: 'Greenhouse',      source: 'greenhouse',      fn: () => scrapeGreenhouse(filterSenior, discovered.greenhouse) },
        { name: 'Lever',           source: 'lever',           fn: () => scrapeLever(filterSenior, discovered.lever) },
        { name: 'Ashby',           source: 'ashby',           fn: () => scrapeAshby(filterSenior, discovered.ashby) },
        { name: 'Workday',         source: 'workday',         fn: () => scrapeWorkday(filterSenior) },
        { name: 'SmartRecruiters', source: 'smartrecruiters', fn: () => scrapeSmartRecruiters(filterSenior, discovered.smartrecruiters) },
        { name: 'Workable',        source: 'workable',        fn: () => scrapeWorkable(filterSenior, discovered.workable) },
        { name: 'Recruitee',       source: 'recruitee',       fn: () => scrapeRecruitee(filterSenior, discovered.recruitee) },
    ];

    let totalFound = 0;
    let totalNew = 0;
    const errors = [];

    await Promise.allSettled(sources.map(async ({ name, source, fn }) => {
        try {
            const result = await fn();
            const { found, newCount } = await saveAndClose(name, source, result);
            totalFound += found;
            totalNew += newCount;
            console.log(`📦 ${name}: ${found} found, ${newCount} new`);
        } catch (err) {
            const msg = `${name}: ${err?.message}`;
            errors.push(msg);
            console.error(`❌ ${msg}`);
            // Still run the closer with an empty result — a source that
            // threw entirely polled zero companies, so nothing gets closed.
            await closeStaleJobs(source, [], []);
        }
    }));

    console.log(`✅ Fast ATS poll complete! Found: ${totalFound} | New: ${totalNew} | Errors: ${errors.length}`);
    return { totalFound, totalNew, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/fastPoll.test.js`
Expected: PASS — 3/3 tests

- [ ] **Step 5: Remove the 7 ATS scrapers from scraper.js's hourly run**

In `backend/src/scraper.js`, remove these four import lines:

```js
import { scrapeGreenhouse } from './scrapers/greenhouse.js';
import { scrapeLever } from './scrapers/lever.js';
import { scrapeWorkday } from './scrapers/workday.js';
```
```js
import { scrapeAshby } from './scrapers/ashby.js';
import { scrapeSmartRecruiters } from './scrapers/smartrecruiters.js';
import { scrapeWorkable } from './scrapers/workable.js';
import { scrapeRecruitee } from './scrapers/recruitee.js';
```

Remove these entries from the `apiScrapers` array:

```js
        { name: 'Greenhouse',       fn: () => scrapeGreenhouse(filterSenior, discovered.greenhouse) },
        { name: 'Lever',            fn: () => scrapeLever(filterSenior, discovered.lever) },
        { name: 'Ashby',            fn: () => scrapeAshby(filterSenior, discovered.ashby) },
        { name: 'SmartRecruiters',  fn: () => scrapeSmartRecruiters(filterSenior, discovered.smartrecruiters) },
        { name: 'Workable',         fn: () => scrapeWorkable(filterSenior, discovered.workable) },
        { name: 'Recruitee',        fn: () => scrapeRecruitee(filterSenior, discovered.recruitee) },
        { name: 'Workday',          fn: () => scrapeWorkday(filterSenior) },
```

`discoverATSCompanies()` is still called in `scraper.js` — check whether `discovered.greenhouse`/`discovered.lever`/`discovered.ashby`/`discovered.smartrecruiters`/`discovered.workable`/`discovered.recruitee` are referenced anywhere else in the file after the removal above. They are not (only `direct.js`/`simplifyjobs.js`/the free boards remain, none of which take a `discovered.*` argument) — remove the now-unused `discoverATSCompanies` import and the `const discovered = ...` line entirely from `scraper.js`.

The remaining `apiScrapers` array in `scraper.js` should now read:

```js
    const apiScrapers = [
        // ── Core ATS scrapers (always run) ──────────────────────────────────────
        { name: 'Direct Pages',     fn: () => scrapeDirectCareerPages(filterSenior) },
        { name: 'SimplifyJobs',     fn: () => scrapeSimplifyJobs(filterSenior) },
        // ── Free job board APIs (always run) ────────────────────────────────────
        { name: 'Adzuna',           fn: () => scrapeAdzuna(filterSenior) },
        { name: 'RemoteOK',         fn: () => scrapeRemoteOK(filterSenior) },
        { name: 'Remotive',         fn: () => scrapeRemotive(filterSenior) },
        { name: 'Himalayas',        fn: () => scrapeHimalayas(filterSenior) },
        { name: 'WeWorkRemotely',   fn: () => scrapeWeWorkRemotely(filterSenior) },
        { name: 'The Muse',         fn: () => scrapeTheMuse(filterSenior) },
        { name: 'Jobicy',           fn: () => scrapeJobicy(filterSenior) },
        // ── context.dev scrapers (only when CONTEXT_DEV_API_KEY is set) ─────────
        ...(contextDevEnabled() ? [
            { name: 'BigTech (context.dev)',            fn: () => scrapeBigTech(filterSenior) },
            { name: 'Platform Discovery (context.dev)', fn: () => scrapePlatformSearch(filterSenior) },
        ] : []),
    ];
```

- [ ] **Step 6: Verify scraper.js syntax and import graph**

Run: `cd backend && node --check src/scraper.js && node -e "import('./src/scraper.js').then(() => console.log('IMPORT OK')).catch(e => { console.error(e); process.exit(1); })"`
Expected: `IMPORT OK`

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS — every test file, including `fastPoll.test.js`

- [ ] **Step 8: Commit**

```bash
git add backend/src/fastPoll.js backend/src/fastPoll.test.js backend/src/scraper.js
git commit -m "feat: add fastPoll.js orchestrator, move the 7 ATS scrapers off the hourly run"
```

---

## Task 7: Wire runFastAtsPoll into the scheduler

**Files:**
- Modify: `backend/src/scheduler.js`

No automated test — `scheduler.js`'s existing cron entries (hourly scraper, 30-min watcher, 12h JSearch/Fantastic, daily BigTech) have no tests either; cron registration is verified by syntax check and read-through, matching the file's existing convention.

- [ ] **Step 1: Import runFastAtsPoll**

In `backend/src/scheduler.js`, add to the imports:

```js
import { runFastAtsPoll } from './fastPoll.js';
```

- [ ] **Step 2: Add the guard flag and safe-runner**

Alongside the existing `let isRunning = false;` etc. at the top of the file, add:

```js
let isFastPollRunning = false;
```

Alongside the existing `runWatcherSafe`/`runJSearchSafe` functions, add:

```js
async function runFastAtsPollSafe() {
    if (isFastPollRunning) {
        console.log('⚠️  Fast ATS poll already running, skipping this cycle');
        return;
    }
    isFastPollRunning = true;
    try {
        await runFastAtsPoll();
    } catch (err) {
        console.error('💥 Fatal fast-ATS-poll error:', err);
    } finally {
        isFastPollRunning = false;
    }
}
```

- [ ] **Step 3: Register the cron schedule**

In `startScheduler()`, add (placing it after the main scraper's registration, before the company watcher's, since it's the next-fastest cycle):

```js
    // Fast ATS poll: the 7 direct-ATS sources (Greenhouse/Lever/Ashby/Workday/
    // SmartRecruiters/Workable/Recruitee), all companies not just watchlisted
    // ones, plus staleness/ghost-job detection. First run 2 min after boot,
    // then every 15 minutes.
    setTimeout(() => runFastAtsPollSafe(), 2 * 60 * 1000);
    cron.schedule('*/15 * * * *', () => runFastAtsPollSafe());
```

Update the startup log line to mention it:

```js
    console.log('⏰ Scheduler initialized — main scraper hourly, fast ATS poll every 15 min, watcher every 30 min, JSearch every 12h');
```

- [ ] **Step 4: Export the safe-runner for manual triggering (matches existing pattern)**

At the bottom of `scheduler.js`, alongside the existing `export { runScraperSafe as triggerScrape };` and `export { runWatcherSafe as triggerWatcher };`, add:

```js
export { runFastAtsPollSafe as triggerFastAtsPoll };
```

- [ ] **Step 5: Verify syntax and import graph**

Run: `cd backend && node --check src/scheduler.js && node -e "import('./src/scheduler.js').then(() => console.log('IMPORT OK')).catch(e => { console.error(e); process.exit(1); })"`
Expected: `IMPORT OK`

- [ ] **Step 6: Commit**

```bash
git add backend/src/scheduler.js
git commit -m "feat: schedule the fast ATS poll every 15 minutes"
```

---

## Task 8: Surface closed jobs — hide from default feed unless saved/applied

**Files:**
- Modify: `backend/src/utils/roleFilters.js`
- Modify: `backend/src/db.js` (add `closed_at` to `JOB_COLUMNS`)
- Test: `backend/src/utils/roleFilters.test.js` (new)

**Interfaces:**
- `buildJobQueryFilters(filters)` keeps its existing signature and return shape (`{ where: string, params: any[] }`) — the new condition is unconditional (no new filter param), so no caller changes elsewhere.

- [ ] **Step 1: Write the failing test**

`backend/src/utils/roleFilters.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildJobQueryFilters } from './roleFilters.js';

describe('buildJobQueryFilters — closed job visibility', () => {
    it('excludes closed jobs from the default query unless they are saved or applied', () => {
        const { where } = buildJobQueryFilters({});

        expect(where).toContain(`(closed_at IS NULL OR status IN ('saved', 'applied'))`);
    });

    it('still includes the closed-job condition alongside other filters', () => {
        const { where, params } = buildJobQueryFilters({ role: 'swe' });

        expect(where).toContain(`(closed_at IS NULL OR status IN ('saved', 'applied'))`);
        expect(params.length).toBeGreaterThan(0); // role filter still added its own params
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/utils/roleFilters.test.js`
Expected: FAIL — the condition string isn't in `where` yet

- [ ] **Step 3: Add the condition**

In `backend/src/utils/roleFilters.js`, inside `buildJobQueryFilters`, add this as the first line after `const conditions = []; const params = [];`:

```js
    // Closed listings drop out of the default feed — a user who already
    // saved or applied keeps seeing their own history, badged as closed
    // by the frontend instead of vanishing.
    conditions.push(`(closed_at IS NULL OR status IN ('saved', 'applied'))`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/utils/roleFilters.test.js`
Expected: PASS — 2/2 tests

- [ ] **Step 5: Add closed_at to JOB_COLUMNS so the API surfaces it**

In `backend/src/db.js`, update `JOB_COLUMNS`:

```js
const JOB_COLUMNS = `
  id, title, company, location, url, source, category, salary, description, notes,
  posted_at, previous_posted_at, reposted_at, scraped_at, applied_at, status, closed_at,
  is_new::int AS is_new,
  is_reposted::int AS is_reposted,
  (CASE WHEN ${PORTAL_DATE_SQL} >= now() - interval '24 hours' THEN 1 ELSE 0 END) AS is_fresh
`;
```

- [ ] **Step 6: Verify db.js syntax**

Run: `cd backend && node --check src/db.js`
Expected: no output (success)

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS — every test file

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/roleFilters.js backend/src/utils/roleFilters.test.js backend/src/db.js
git commit -m "feat: exclude closed jobs from default feed unless saved or applied"
```

---

## Task 9: Frontend — surface the "listing closed" badge

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/globals.css`

No test framework exists in the frontend (matches this repo's existing state — only the backend gained Vitest in the prior sub-project). Verify with `npx tsc --noEmit` and a manual read-through.

- [ ] **Step 1: Add closed_at to the Job type**

In `frontend/src/lib/api.ts`, add to the `Job` interface (after `applied_at`):

```ts
    applied_at: string | null;
    closed_at: string | null;
```

- [ ] **Step 2: Add the badge CSS**

In `frontend/src/app/globals.css`, add alongside the other `.badge-*` rules (after `.badge-saved`):

```css
.badge-closed { border-color: var(--ink-4); color: var(--ink-3); background: var(--paper-dim); }
```

- [ ] **Step 3: Render the badge**

In `frontend/src/app/page.tsx`, in the `job-badges` block, add the closed badge (placed first, since it's the most important signal when present):

```tsx
                <div className="job-badges">
                    {job.closed_at && <span className="badge badge-closed">Listing closed</span>}
                    {job.is_fresh === 1 && <span className="badge badge-fresh">Recent</span>}
                    {job.is_reposted === 1 && <span className="badge badge-reposted">Reposted</span>}
                    {job.is_new === 1 && <span className="badge badge-new">New</span>}
                    {shouldShowSourceBadge(job.source) && (
                        <span className="badge badge-source">{formatSource(job.source)}</span>
                    )}
                    <span className={`badge badge-cat-${job.category}`}>{catLabel}</span>
                    {job.status === 'applied' && <span className="badge badge-applied">Applied</span>}
                    {job.status === 'saved' && <span className="badge badge-saved">Saved</span>}
                </div>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/app/page.tsx frontend/src/app/globals.css
git commit -m "feat: show a Listing closed badge for saved/applied jobs that closed"
```
