# Fast ATS Polling + Ghost-Job Staleness Detection

**Status:** Approved for planning
**Date:** 2026-08-17
**Sub-project:** 2 of 3 in the job-hunter-project differentiation roadmap (1: broaden main-feed ATS coverage — done; 2: this doc; 3: long-tail discovery via schema.org/JobPosting crawling — future)

## Context

Competitive research (conducted 2026-08-17, see conversation history) found that job aggregators split into two lanes: broad-scrape aggregators (Jobright.ai: LinkedIn/Indeed/career-page scraping, ~400K listings/day) and direct-career-page pollers (Simplify.jobs: hourly polling of 50,000+ company career pages). Jobright's most consistent, recurring complaint across Reddit/reviews is **ghost/expired listings** — users report roughly half of "high match" jobs are already closed by the time they apply. Simplify's stronger freshness reputation comes specifically from direct polling, not from aggregating other aggregators. Industry estimates put ghost-job prevalence at 18-22% on major boards.

This project already uses the *direct-polling* lane (Greenhouse/Lever/Ashby/Workday/SmartRecruiters/Workable/Recruitee APIs, not scraped LinkedIn/Indeed) — the harder-to-scale but higher-trust approach. It already has one instance of fast, diff-based polling: `companyWatcher.js` diffs each user-watchlisted company's ATS board every 30 minutes and push-notifies on new postings. But that speed advantage is currently scoped to companies a user manually adds to the watchlist — the main aggregation feed (which is what every job in the dashboard ultimately comes from) still runs hourly and never detects when a listing disappears.

This sub-project generalizes the watchlist's "diff and notice" mechanism to the entire main feed for the 7 ATS sources capable of returning a complete per-company listing, and uses that same diff to detect and surface closed listings — directly targeting the #1 complaint identified in research, using infrastructure the project already has 90% of the pieces for.

## Goals

1. Every company in the main feed's 7 direct-ATS sources gets watchlist-speed polling (~15-20 min), not just companies a user explicitly watches.
2. Jobs that disappear from their source's live listing get marked closed and stop appearing in the default browsing feed, without losing the user's own application history for jobs they'd already engaged with.
3. No regression to `companyWatcher.js`'s existing notification behavior — it is not modified by this change.

## Non-goals (explicitly out of scope for this sub-project)

- Merging `companyWatcher.js` into the main scraper (Approach A, considered and rejected for this step as higher-risk than needed — the duplicate-fetch inefficiency it would eliminate is a minor cost, not a correctness problem).
- Staleness detection for free job-board aggregators (RemoteOK, Adzuna, SimplifyJobs, Remotive, Himalayas, WeWorkRemotely, The Muse, Jobicy) or the optional JSearch/Fantastic.jobs/context.dev feeds. These sources return secondary, sampled, or paginated listings — a job's absence from one re-fetch doesn't mean it closed, only that this particular re-aggregation missed it. Applying the closer sweep to them would produce false closures.
- `direct.js` ("Direct Pages") is also excluded from the fast poll and closer sweep, even though some of its entries happen to point at Greenhouse URLs. It's a small, separately-curated mix of feed types (not uniformly one clean ATS), so it stays on the existing hourly cadence with no staleness detection. Folding its Greenhouse-typed entries into `greenhouse.js` proper (making them eligible for fast polling) is a reasonable future cleanup, not part of this sub-project.
- Long-tail discovery via schema.org/Common Crawl (sub-project 3).

## Architecture

### 1. Schema changes (`backend/src/db.js`)

Three new columns on `jobs`, added via the existing idempotent migration pattern (`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ...`, called from `initDb()`):

```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS missed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
```

`closed_at IS NULL` means the job is considered open — no separate boolean is needed, and a non-null value doubles as "closed since" for display. `last_seen_at` is distinct from the existing `scraped_at` (which today only updates on insert or repost, not on every "still here, unchanged" observation) and distinct from `posted_at` (the portal-reported date, not something we control).

### 2. Scraper contract change (7 direct-ATS scraper modules)

`greenhouse.js`, `lever.js`, `ashby.js`, `workday.js`, `smartrecruiters.js`, `workable.js`, `recruitee.js` each currently return `Promise<Job[]>` from a loop that silently `continue`s past any company whose fetch fails. That means today's output can't distinguish "this company has zero matching jobs right now" from "this company's fetch timed out" — and the closer sweep cannot safely be built on that ambiguity, or a single flaky response would wrongly close every open job at that company.

Each of the 7 scrapers changes its return shape to:

```js
{ jobs: Job[], polledCompanies: string[] }  // polledCompanies = company `name` values (matching jobs.company), only for companies whose fetch succeeded this run
```

Companies whose fetch threw or returned non-OK are simply omitted from `polledCompanies` (same as today's silent-skip behavior for `jobs`) — the closer sweep below only evaluates jobs belonging to a company that's actually in this list.

### 3. Closer sweep

For each of the 7 sources, after a poll cycle produces `{ jobs, polledCompanies }`:

- **Seen jobs** (URL present in this run's `jobs`): handled inside the existing `insertJob()` — set `last_seen_at = now()`, `missed_count = 0`, and if previously closed, clear `closed_at` (a job reopening after being marked closed is legitimate and already conceptually adjacent to the existing repost-detection logic in `insertJob`).
- **Missing jobs** (a DB row with `source = X`, `company` in `polledCompanies`, `closed_at IS NULL`, but URL not in this run's `jobs`): `missed_count += 1`; at `missed_count >= 2` (two consecutive misses — tolerates one transient failure without falsely closing a job), set `closed_at = now()`.

The diff itself — given DB rows for a source+polled-companies and the fresh URL set, compute which rows to increment vs. close vs. leave alone — is a **pure function**, independent of the database, so it's unit-testable without a live Postgres connection. `db.js` adds a thin wrapper (`closeStaleJobs(source, polledCompanies, freshUrls)`) that fetches the candidate rows, calls the pure function, and issues the UPDATE.

### 4. Cadence split (`backend/src/scraper.js`, `backend/src/scheduler.js`)

The 7 direct-ATS scrapers move to their own faster poll (~15-20 min cron), separate from the existing hourly run that continues to cover the free job-board aggregators and optional paid feeds unchanged. `companyWatcher.js` keeps its independent 30-min cycle and its own fetch calls (via `atsFetchers.js`) — it is not merged with or replaced by the new fast poll in this sub-project (see Non-goals).

### 5. UX (`backend/src/utils/roleFilters.js` query filters, frontend)

Default job feed queries exclude `closed_at IS NOT NULL` rows **unless** `status IN ('saved', 'applied')` — a user who already engaged with a job before it closed keeps seeing it (their own application history shouldn't vanish), shown with a "listing closed" badge instead. Jobs with `status = 'new'` (never engaged with) that close simply drop out of the default feed — that's the point: no dead links wasting the user's time browsing.

## Testing

- Pure diff function: unit tests covering seen/missing/threshold/reopen cases, no DB required.
- Each of the 7 scrapers: existing classification/filtering tests extended to assert `polledCompanies` excludes companies whose mocked fetch throws, following the same mocking pattern already established in `smartrecruiters.test.js`/`workable.test.js`/`recruitee.test.js`.
- `closeStaleJobs` db.js wrapper: thin enough that it's covered by testing the pure function it delegates to; the SQL plumbing itself is low-risk, matching the project's existing convention of not having DB-integration tests.

## Open questions / risks

- **Rate limits at faster cadence**: polling ~7 sources × their full company lists every 15-20 min instead of hourly is a real increase in request volume against Greenhouse/Lever/Ashby/etc. Implementation should verify this stays within each ATS's documented/observed rate limits (see prior research: Greenhouse ≈50-75 req/30s, Lever caps custom job-site POSTs at 2/sec) and keep the existing per-company `sleep()` courtesy delays.
- **Run-time budget**: the fast poll must comfortably finish within its own interval before the next one starts (mirroring the existing `isRunning`-guard pattern in `scheduler.js` that skips an overlapping cycle rather than piling up).
