# Visa signals for OPT / STEM OPT students — design

Date: 2026-10-28

## Why

The site is a shared, public US tech job board. Its main audience is
international students on OPT and STEM OPT. Their biggest time-waster is
finding a good role and only then learning, deep in the description, that the
company says "no sponsorship", or applying to companies that quietly never
sponsor. Jobright, SimplifyJobs and career-ops answer "where are the jobs"; this
feature answers "will this company actually hire and sponsor me".

Success: a student can tell from the job card, before clicking Apply, (1) what
the posting itself says about visas and (2) whether the company has filed
H-1B applications recently.

## Goals

1. **Posting wording badge.** Each job card shows what the posting says:
   - `No sponsorship` — the description says the company won't sponsor.
   - `Sponsors visas` — the description says sponsorship is available.
   - nothing — the posting doesn't say, or the job has no description.
2. **Company H-1B record.** Each job card shows the company's recent H-1B
   filings from official US Department of Labor data, e.g.
   `H-1B: 1,240 filings FY25–26 · last filed Jun 2026`, or
   `H-1B: no data available` when the company's name matched nothing or the
   match is ambiguous (decided by the user).
3. **Filters** on the feed: "Hide no-sponsorship jobs" and "Only companies with
   H-1B filings in FY25–26".
4. **Quarterly refresh** by one manual browser download plus one command.

## Non-goals

- Citizen-only / security-clearance jobs stay **hidden** from the feed, as
  today (`us_ineligible`). No badge for them.
- No data older than FY2025. The user was explicit: many companies stopped
  sponsoring during 2024–2026, so older numbers mislead.
- No E-Verify / "STEM OPT eligible" mark: E-Verify only offers a search form,
  no bulk download or API.
- No H-1B salary display in this version (the data supports it; later).
- No user accounts or per-user state (the board is shared).

## Anti-goals (would be a failure even if it "works")

- Showing a wrong company's numbers. When the name match is uncertain, show
  nothing instead.
- Wording that implies a company "never sponsors". When nothing matches, the
  card says "H-1B: no data available", because a name mismatch can hide real
  filings.
- Storing personal data from the source file (contact person, attorney names,
  emails, phones). Only company-level aggregates are kept.
- Getting around the Labor Department site's block on automated downloads.
  The file is downloaded by a person in a browser.

## Data source (decided)

US Department of Labor, Office of Foreign Labor Certification, **LCA public
disclosure files** (Form ETA-9035, covers H-1B, H-1B1, E-3), from
https://www.dol.gov/agencies/eta/foreign-labor/performance

- Files are `.xlsx`, one per fiscal-year quarter, **cumulative within the fiscal
  year** (the Q3 file contains Q1–Q3). One row = one application.
- Use: **FY2025 Q4** (full year Oct 2024 – Sep 2025) and the **latest FY2026**
  file (currently Q3: Oct 2025 – Jun 2026). When FY2026 Q4 comes out it replaces
  FY2026 Q3; when FY2027 files come out, FY2025 drops off.
- `dol.gov` returns HTTP 403 to automated clients. The admin downloads the file
  in a browser and runs the import command locally against `DATABASE_URL`
  (the Supabase connection string). The backend on Railway never downloads it.
- Columns used (from the FY2026 Q3 record layout):
  `CASE_NUMBER`, `CASE_STATUS` (Certified, Certified-Withdrawn, Denied,
  Withdrawn), `DECISION_DATE`, `VISA_CLASS` (H-1B, E-3 Australian, H-1B1 Chile,
  H-1B1 Singapore), `EMPLOYER_NAME`, `TRADE_NAME_DBA`, `EMPLOYER_FEIN`,
  `TOTAL_WORKER_POSITIONS`, `SOC_CODE`, `JOB_TITLE`.
- All other columns, especially every `EMPLOYER_POC_*`, `AGENT_ATTORNEY_*`,
  `LAWFIRM_*` and `PREPARER_*` field, are ignored and never written anywhere.

### What counts as a "filing"

- Only `VISA_CLASS = 'H-1B'`.
- Only `CASE_STATUS` in `Certified` or `Certified-Withdrawn` (the company got
  the certification; withdrawn-after-certification still shows intent).
  Denied and withdrawn-before-decision rows are excluded.
- Count = number of applications (rows), not `TOTAL_WORKER_POSITIONS`, because
  one application can list many positions and that inflates outsourcing firms.
- "Last filed" = the latest `DECISION_DATE` among counted rows.
- Deduplicate by `CASE_NUMBER` across the two files (a case can only appear in
  one fiscal year's file, but be defensive).

## Company matching (decided approach)

- Aggregate filings per **normalized employer name**, using the existing
  `normalizeCompanyName` / `companyNameKeys` in
  `backend/src/utils/companyNames.js`. Add `TRADE_NAME_DBA` as a second key for
  the same row. **No extra token stripping** (e.g. no dropping "services" or
  "com"): strict keys only. *(Builder-check resolution, my call.)*
- **Alias list:** a small, hand-kept file (e.g. `backend/src/presets/h1bAliases.js`)
  maps a feed company key to the government employer keys that belong to it,
  for large companies that file under several legal entities (Amazon →
  "amazon com services", "amazon web services", "amazon development center
  us", ...; likewise Google, Microsoft, Meta/"meta platforms", Apple, etc.).
  Reviewed at each quarterly import. *(My call.)*
- **Ambiguity rule:** when one normalized key collects rows from **two or more
  different `EMPLOYER_FEIN` values** and the key is not covered by the alias
  list, the key is marked ambiguous and the card shows "H-1B: no data available" (better
  no number than a wrong company's number). This is the only use of FEIN.
  *(My call.)*
- Summing: within one key (same FEIN), or across keys an alias entry joins,
  filings are summed. A job is matched through its company's `companyNameKeys`;
  if several keys hit the same employer, it is counted once.
- Matching happens at **read time** in the API against the imported table, so
  companies added by scrapers after an import still match; the importer never
  reads the `jobs` table. *(My call.)*
- If `h1b_employers` is empty (never imported), no H-1B line is shown at all.

## Posting wording detection (decided approach)

Regex/keyword rules on the stored job `title + description` (descriptions are
stored truncated to ~500 chars for many sources; detection runs on whatever is
stored). Computed when a job is saved (like `us_ineligible`), stored on the job
row, and backfilled once at startup for existing rows.

- `no_sponsorship` examples: "no sponsorship", "not able to sponsor", "unable to
  sponsor", "will not sponsor", "does not sponsor", "cannot sponsor", "without
  (the need for) sponsorship", "sponsorship is not available", "not eligible for
  visa sponsorship", "must be authorized to work ... without sponsorship".
- `sponsors` examples: "visa sponsorship available", "will sponsor", "we
  sponsor", "sponsorship provided", "H-1B sponsorship", "open to sponsoring".
- Negative wording wins when both appear.
- Citizenship / clearance wording keeps working exactly as today (job hidden).

## Data model (decided)

- New table `h1b_employers`: one row per normalized employer key, with
  `filings` (int), `last_decision_date` (date), `fiscal_years` (text, e.g.
  "FY25–26"), `display_name` (most common raw employer name),
  `imported_at` (timestamptz). Replaced wholesale on each import (in a
  transaction, so the site never sees a half-loaded table).
- New column on `jobs`: `visa_wording` text (`no_sponsorship`, `sponsors`, or
  NULL). Backfilled once at startup, like `us_ineligible`.

## API (decided)

- `GET /api/jobs` adds per job: `visa_wording` and `h1b` (null, or
  `{ filings, last_filed, fiscal_years }`). New query params:
  `hide_no_sponsorship=1`, `h1b_only=1`.
- `GET /api/stats` (or a small `GET /api/h1b/meta`) exposes when the H-1B data
  was imported and which fiscal years it covers, for a footnote on the page.
- The feed must stay fast (currently ~15 ms query, ~0.15 s end to end). The
  H-1B match must not reintroduce per-request regex scans over all rows.

## Frontend (decided)

In the job card's meta line (where it shows location · Posted · Synced, see
`frontend/src/app/page.tsx` `JobCard`):

- `No sponsorship` badge (warning color) or `Sponsors visas` badge (positive
  color), or nothing.
- H-1B text: `H-1B: 1,240 filings FY25–26 · last filed Jun 2026`, or
  `H-1B: no data available` (same text for "no match" and "ambiguous match";
  the API may return `h1b: null` for both).
- Two filter chips in the existing filter bar: "Hide no-sponsorship" and
  "H-1B sponsors only".
- A one-line footnote near the stats: "H-1B data: US Dept. of Labor LCA filings,
  FY2025–FY2026 Q3, updated <date>."

## Refresh process (decided)

1. Admin downloads the new `LCA_Disclosure_Data_FY20XX_QX.xlsx` from the DOL
   performance page in a browser.
2. Runs `node scripts/import-h1b-lca.js <file1.xlsx> [file2.xlsx]` from
   `backend/` with `DATABASE_URL` set.
3. The script streams the files (they are large, likely hundreds of MB and
   hundreds of thousands of rows), aggregates, and replaces `h1b_employers`.
4. README gets a short "Updating H-1B data" section.

## Constraints

- Node.js 20, ESM, Express, `pg`, Vitest (existing backend). Next.js 15 /
  React 19 / TypeScript strict (existing frontend).
- Supabase free tier (500 MB). The aggregated table must stay small (target
  well under 10 MB); raw rows are never stored.
- No new paid services, no AI calls, no login-gated sources.
- The xlsx files must be parsed in a streaming way to keep memory reasonable on
  a laptop; the parsing library choice is the builder's.

## Left to the builder

- xlsx parsing library and streaming approach.
- Exact regex lists for posting wording (start from the examples above; add
  tests from real descriptions in the database).
- Exact extra normalization for government employer names, as long as there
  are no cross-company false matches (cover with tests using real names such
  as Amazon's, Google's, Microsoft's LLCs and a few near-collisions).
- Whether the H-1B lookup is a SQL join or an in-memory map in the API process.
- Badge colors and exact copy, within the meanings above.
