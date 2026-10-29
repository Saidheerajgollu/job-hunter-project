# Visa Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show OPT/STEM OPT students, on every job card, what the posting says about visa sponsorship and the company's FY2025–FY2026 H-1B filing record, with two feed filters.

**Architecture:** Posting wording is detected when a job is saved and stored in a new `jobs.visa_wording` column (backfilled once at startup). H-1B data is aggregated from US Dept. of Labor LCA `.xlsx` files by a local import script into a small `h1b_employers` table; the API loads it into an in-memory index (refreshed every 10 min) and attaches `h1b` to each job at read time via the existing company-name normalizer plus a hand-kept alias list.

**Tech Stack:** Node.js 20 ESM, Express, `pg`, Vitest; `exceljs` (streaming xlsx reader, devDependency, used only by the import script); Next.js 15, React 19, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-10-28-visa-signals-design.md`

## Global Constraints

- Only FY2025 and FY2026 data; never show older numbers.
- A filing = row with `VISA_CLASS` = `H-1B` and `CASE_STATUS` in `Certified` / `Certified-Withdrawn`; count distinct `CASE_NUMBER`s, not `TOTAL_WORKER_POSITIONS`.
- Never store or log `EMPLOYER_POC_*`, `AGENT_ATTORNEY_*`, `LAWFIRM_*`, `PREPARER_*` fields.
- The backend on Railway never downloads from dol.gov; the admin downloads in a browser and runs the script locally.
- Card copy: `H-1B: {n} filings FY25–26 · last filed {Mon YYYY}`; no match or ambiguous match: `H-1B: no data available`; no H-1B line at all when the table has never been imported.
- Posting badges: `No sponsorship`, `Sponsors visas`, or nothing. Negative wording wins when both appear.
- Citizen-only jobs stay hidden (`us_ineligible`), unchanged.
- Feed query must stay fast (~15 ms DB time); no per-request regex over all rows.
- Strict name keys only (no extra token stripping); aliases come from `backend/src/presets/h1bAliases.js`; a key with ≥2 distinct `EMPLOYER_FEIN`s and no alias coverage is ambiguous.

## Review Focus

1. **Excel dates arrive as JS `Date`, Excel serial numbers, or strings** — the importer must turn all three into a date; a bad date skips the row's "last filed" contribution, never crashes. (Test in Task 2.)
2. **Status/visa values with odd case or spacing** (`certified - withdrawn`, ` H-1B `) — still counted correctly. (Task 2.)
3. **Re-running or failing an import halfway** — the site keeps the previous data (single transaction replace). (Task 4.)
4. **"Sponsorship" in unrelated senses** ("event sponsorship", "sponsorship deals") — no badge. (Task 1.)
5. **H-1B table empty / never imported** — no H-1B line, the "H-1B sponsors only" chip hidden, and `h1b_only=1` ignored rather than returning zero jobs. (Tasks 5 and 6.)

---

### Task 1: Posting wording detection and storage

**Files:**
- Create: `backend/src/utils/visaWording.js`
- Test: `backend/src/utils/visaWording.test.js`
- Modify: `backend/src/db.js` (initDb migration + backfill; `insertJob` INSERT and both UPDATEs; `JOB_COLUMNS`)
- Modify: `backend/src/utils/roleFilters.js` (`hide_no_sponsorship`)
- Test: `backend/src/utils/roleFilters.test.js`

**Interfaces:**
- Produces: `detectVisaWording(title: string, description?: string | null): 'no_sponsorship' | 'sponsors' | null`
- Produces: `jobs.visa_wording TEXT` returned in `/api/jobs` rows; `buildJobQueryFilters({ hide_no_sponsorship: boolean, ... })` adds `visa_wording IS DISTINCT FROM 'no_sponsorship'`.

- [ ] **Step 1: Write failing tests** in `visaWording.test.js`:
  - `detectVisaWording('SWE', 'We are unable to sponsor visas at this time')` → `'no_sponsorship'`; same for "will not sponsor", "does not offer sponsorship", "without the need for sponsorship", "sponsorship is not available", "not eligible for visa sponsorship", "No sponsorship".
  - `'Visa sponsorship available'`, `'We will sponsor H-1B'`, `'H-1B sponsorship provided'` → `'sponsors'`.
  - Both present (`'Visa sponsorship available for some roles; this role will not sponsor'`) → `'no_sponsorship'`.
  - `'Manage event sponsorship deals'` → `null`; empty/undefined description and title-only input → `null`.
  - In `roleFilters.test.js`: `buildJobQueryFilters({ hide_no_sponsorship: true }).where` contains `visa_wording IS DISTINCT FROM 'no_sponsorship'`; without the flag it does not.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/utils/visaWording.test.js src/utils/roleFilters.test.js` — Expected: FAIL (module not found / assertion).
- [ ] **Step 3: Implement** `detectVisaWording` with two lists of case-insensitive regexes matched against `${title} ${description}`; negatives checked first. Add `hide_no_sponsorship` to `buildJobQueryFilters`.
- [ ] **Step 4: DB wiring** in `db.js`: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS visa_wording TEXT`; one-time backfill guarded by a `settings` key `migration_visa_wording_2026_10` (same pattern as `migration_lever_reopen_2026_10`), computed in JS in batches of 1,000 over rows with a non-null description; `insertJob` writes `detectVisaWording(job.title, job.description)` in the INSERT and both UPDATE paths (next free `$n`); add `visa_wording` to `JOB_COLUMNS`.
- [ ] **Step 5: Run** `cd backend && npx vitest run` — Expected: all pass.
- [ ] **Step 6: Commit** `feat: detect visa sponsorship wording in job postings`

### Task 2: LCA row filtering and aggregation (pure)

**Files:**
- Create: `backend/src/utils/h1bAggregate.js`
- Test: `backend/src/utils/h1bAggregate.test.js`

**Interfaces:**
- Consumes: `normalizeCompanyName(name)` from `backend/src/utils/companyNames.js`.
- Produces: `parseLcaDate(value: Date | number | string | null): Date | null`
- Produces: `isCountedFiling(row: { CASE_STATUS, VISA_CLASS }): boolean`
- Produces: `fiscalYearOf(date: Date): number` (Oct–Sep; 2025-10-01 → 2026)
- Produces: `createAggregator(): { add(row: object): void, result(): H1bEmployerRow[] }` where `H1bEmployerRow = { key: string, display_name: string, filings: number, last_decision_date: string /* YYYY-MM-DD */ | null, fein_count: number, min_fy: number, max_fy: number }`. `add` reads only `CASE_NUMBER, CASE_STATUS, VISA_CLASS, DECISION_DATE, EMPLOYER_NAME, TRADE_NAME_DBA, EMPLOYER_FEIN`; a row adds to the key of `EMPLOYER_NAME` and, if different, the key of `TRADE_NAME_DBA`; duplicate `CASE_NUMBER`s per key count once; `display_name` = most frequent raw `EMPLOYER_NAME` for the key; rows with FY < 2025 are dropped.

- [ ] **Step 1: Write failing tests:**
  - `parseLcaDate(new Date('2026-06-30'))`, `parseLcaDate(46203)` (Excel serial → 2026-06-30), `parseLcaDate('06/30/2026')`, `parseLcaDate('2026-06-30')` all → that date; `parseLcaDate('garbage')` and `null` → `null`.
  - `isCountedFiling({ CASE_STATUS: 'Certified', VISA_CLASS: 'H-1B' })` true; `' certified - withdrawn '`/`'h-1b'` true; `'Denied'`, `'Withdrawn'`, `VISA_CLASS: 'E-3 Australian'`, `'H-1B1 Chile'` false.
  - `fiscalYearOf(new Date('2025-09-30'))` → 2025; `new Date('2025-10-01')` → 2026.
  - Aggregator: three Amazon rows (`AMAZON COM SERVICES LLC`, two FEINs, one duplicate case number, one Denied) → one key `amazoncomservices` with `filings: 2`, `fein_count: 2`, latest date; a row with `TRADE_NAME_DBA: 'Acme Labs'` under `ACME HOLDINGS LLC` counts under both `acme` and `acmelabs`; a FY2024 row is ignored; result rows never contain any key other than the `H1bEmployerRow` fields.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/utils/h1bAggregate.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the four functions. Excel serial: days since 1899-12-30, UTC.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat: aggregate DOL LCA rows into per-employer H-1B filings`

### Task 3: Alias list and read-time matching (pure)

**Files:**
- Create: `backend/src/presets/h1bAliases.js`
- Create: `backend/src/utils/h1bMatch.js`
- Test: `backend/src/utils/h1bMatch.test.js`

**Interfaces:**
- Consumes: `companyNameKeys(name)` from `companyNames.js`; `H1bEmployerRow` (Task 2).
- Produces: `H1B_ALIASES: Record<string /* feed key */, string[] /* government keys */>` — at least `amazon`, `google`, `alphabet`, `microsoft`, `meta`, `apple`, `nvidia`, `salesforce`, `oracle`, `ibm`, `intel`, `jpmorgan`/`jpmorganchase`, each mapped to the government keys for that company's legal entities. Seed with known ones (`amazon: ['amazoncomservices', 'amazonwebservices', 'amazondevelopmentcenterus']`); Task 7 fills the rest from the real file. List only keys that differ from the feed key (`GOOGLE LLC` already normalizes to `google`).
- Produces: `buildH1bIndex(rows: H1bEmployerRow[], aliases = H1B_ALIASES): { lookup(companyName: string): H1bSummary | null | 'none', isEmpty(): boolean }` where `H1bSummary = { filings: number, last_filed: string /* YYYY-MM-DD */, fiscal_years: string /* 'FY25–26' */ }`. Return `'none'` when nothing matches **or** the only hits are ambiguous (`fein_count >= 2` reached without an alias); summary when matched. Hits reached via an alias skip the ambiguity check. A government key hit through several of the company's keys/aliases counts once. `fiscal_years` built from min/max FY of the contributing rows (`FY25`, `FY25–26`).

- [ ] **Step 1: Write failing tests:**
  - Index from rows `{key:'stripe', filings:40, fein_count:1, ...}` → `lookup('Stripe, Inc.')` → `{ filings: 40, ... }`.
  - `{key:'box', fein_count:2}` with no alias → `lookup('Box')` → `'none'`.
  - Amazon rows under `amazoncomservices` (fein 3) and `amazonwebservices` (fein 1) with alias `amazon: ['amazoncomservices','amazonwebservices']` → `lookup('Amazon')` sums both, ambiguity ignored.
  - `lookup('Google / Alphabet')` with rows under `google` and alias `alphabet: ['google']` → counted once, not doubled.
  - `lookup('Unknown Co')` → `'none'`; `buildH1bIndex([]).isEmpty()` → `true`.
  - `fiscal_years` → `'FY25–26'` when rows span 2025–2026, `'FY26'` when only 2026; `last_filed` is the max date.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/utils/h1bMatch.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `h1bAliases.js` and `buildH1bIndex` (Map from key → row; per lookup gather hit keys from `companyNameKeys(name)` ∪ alias targets into a Set, then sum).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: match feed companies to H-1B employers with aliases`

### Task 4: Storage and import script

**Files:**
- Modify: `backend/src/db.js` (table + functions)
- Create: `backend/scripts/import-h1b-lca.js`
- Modify: `backend/package.json` (devDependency `exceljs`)

**Interfaces:**
- Consumes: `createAggregator()` (Task 2).
- Produces (db.js): `replaceH1bEmployers(rows: H1bEmployerRow[]): Promise<number>` — `BEGIN; DELETE FROM h1b_employers; INSERT ... (batched via unnest); INSERT/UPDATE settings key 'h1b_imported_at'; COMMIT` using one pooled client, `ROLLBACK` on error.
- Produces (db.js): `getH1bEmployers(): Promise<H1bEmployerRow[]>`; `getH1bMeta(): Promise<{ imported_at: string | null, min_fy: number | null, max_fy: number | null, latest_decision: string | null }>`.
- Schema (in `initDb`): `CREATE TABLE IF NOT EXISTS h1b_employers (key TEXT PRIMARY KEY, display_name TEXT NOT NULL, filings INTEGER NOT NULL, last_decision_date DATE, fein_count INTEGER NOT NULL, min_fy INTEGER NOT NULL, max_fy INTEGER NOT NULL)`.
- Script CLI: `node scripts/import-h1b-lca.js <file.xlsx> [more.xlsx]` with `DATABASE_URL` set; prints rows read, rows counted, employers, and writes via `replaceH1bEmployers`. Uses `exceljs` `stream.xlsx.WorkbookReader`, maps header row names to column indexes, passes plain objects with only the 7 fields to `aggregator.add`.

- [ ] **Step 1:** `cd backend && npm install --save-dev exceljs` — Expected: added to `devDependencies`.
- [ ] **Step 2: Add schema + functions** to `db.js`.
- [ ] **Step 3: Write the script.** Exit code 1 with a clear message when a required header (`CASE_NUMBER`, `CASE_STATUS`, `VISA_CLASS`, `DECISION_DATE`, `EMPLOYER_NAME`) is missing.
- [ ] **Step 4: Verify on local Postgres** with a small hand-made `.xlsx` (5 rows incl. a Denied, an E-3, a duplicate case, a FY2024 row) built by a throwaway exceljs snippet in the scratchpad: run the script twice → `SELECT count(*), sum(filings) FROM h1b_employers` identical both times; kill the DB mid-run (or point at a bad table) → previous rows still there.
- [ ] **Step 5: Commit** `feat: import DOL LCA files into h1b_employers`

### Task 5: API

**Files:**
- Create: `backend/src/h1bLookup.js`
- Test: `backend/src/h1bLookup.test.js`
- Modify: `backend/src/server.js` (`GET /api/jobs`, new `GET /api/h1b/meta`)
- Modify: `backend/src/utils/roleFilters.js` (`h1b_companies` param)

**Interfaces:**
- Consumes: `getH1bEmployers`, `getH1bMeta` (Task 4); `buildH1bIndex` (Task 3); `getOpenCompanyNames()` (existing in db.js).
- Produces: `getH1bIndex(): Promise<Index>` — cached, reloads from DB at most every 10 minutes.
- Produces: `attachH1b(jobs: Job[], index): Job[]` — adds `h1b: H1bSummary | 'none' | null` (`null` when `index.isEmpty()`).
- Produces: `h1bCompanyNames(index, feedNames: string[]): string[]` — feed names whose lookup is a summary (cached with the index).
- `buildJobQueryFilters({ h1b_companies: string[] | null })` → `company = ANY($n)` when a non-null array is passed.
- `/api/jobs` query params: `hide_no_sponsorship=1`, `h1b_only=1` (ignored when the index is empty).
- `GET /api/h1b/meta` → `getH1bMeta()` result.

- [ ] **Step 1: Write failing tests** (`h1bLookup.test.js`, mock `./db.js`): `attachH1b` sets summaries/`'none'`; returns `h1b: null` for every job when no rows; `h1bCompanyNames` returns only matched names; index reload happens once within 10 minutes (fake timers). `roleFilters.test.js`: `h1b_companies: ['Stripe']` adds `company = ANY(`; `h1b_companies: null` adds nothing.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/h1bLookup.test.js src/utils/roleFilters.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `h1bLookup.js`, the filter param, and server changes.
- [ ] **Step 4: Run** `cd backend && npx vitest run` — Expected: all pass. Then local e2e: with the Task 4 sample imported, `curl 'localhost:4000/api/jobs?limit=3&h1b_only=1'` returns jobs whose `h1b.filings > 0`, and DB time for the feed stays within ~2× of before.
- [ ] **Step 5: Commit** `feat: attach H-1B records and visa filters to the job feed`

### Task 6: Frontend badges, filters, footnote

**Files:**
- Modify: `frontend/src/lib/api.ts` (`Job.visa_wording`, `Job.h1b`, `JobFilters.hide_no_sponsorship`, `JobFilters.h1b_only`, `api.getH1bMeta()`)
- Modify: `frontend/src/app/page.tsx` (`JobCard` meta line ~360–385; `FilterBar` chips near `chip-salary` ~312; footnote under `StatsBar`)
- Modify: `frontend/src/app/globals.css` (two badge styles)

**Interfaces:**
- Consumes: `/api/jobs` fields `visa_wording`, `h1b`; `/api/h1b/meta`.
- Produces: `formatH1b(h1b: H1bSummary | 'none' | null): string | null` in `page.tsx` — `'H-1B: 1,240 filings FY25–26 · last filed Jun 2026'`, `'H-1B: no data available'`, or `null`.

- [ ] **Step 1: Implement** types, `formatH1b`, badges (`No sponsorship` warning style, `Sponsors visas` positive style) in the meta line, chips "Hide no-sponsorship" and "H-1B sponsors only" (the latter hidden when meta has no `imported_at`), and the footnote `H-1B data: US Dept. of Labor LCA filings, FY{min}–FY{max}, updated {date}.` (hidden when not imported).
- [ ] **Step 2: Verify** `cd frontend && npx tsc --noEmit && npm run build` — Expected: no errors. Then run frontend against the local backend and check one card of each kind (sponsors badge, no-sponsorship badge, H-1B number, "no data available") with the browser.
- [ ] **Step 3: Commit** `feat: show visa badges, H-1B records and filters on job cards`

### Task 7: Real data import, docs, deploy

**Files:**
- Modify: `backend/src/presets/h1bAliases.js` (fill from real data)
- Modify: `README.md` ("Updating H-1B data" section; sources table row)

- [ ] **Step 1:** Ask the user to download `LCA_Disclosure_Data_FY2025_Q4.xlsx` and `LCA_Disclosure_Data_FY2026_Q3.xlsx` from https://www.dol.gov/agencies/eta/foreign-labor/performance into a folder they name.
- [ ] **Step 2:** Run the import locally against a local Postgres copy first; check `h1b_employers` size (`pg_total_relation_size`, target < 10 MB) and spot-check Amazon, Google, Microsoft, Meta, Apple, Stripe, Nvidia, JPMorgan; add missing government keys to `h1bAliases.js` until each resolves to a plausible number.
- [ ] **Step 3:** With the user's go-ahead, run the import against production `DATABASE_URL` (Supabase); verify `/api/h1b/meta` and a few live cards.
- [ ] **Step 4:** README section: where to download, the command, quarterly cadence (replace FY2026 file each new quarter; drop FY2025 when FY2027 starts).
- [ ] **Step 5: Commit + push** `feat: load FY25–26 H-1B data and document the quarterly refresh`; verify Railway and Vercel deploys and the live site.
