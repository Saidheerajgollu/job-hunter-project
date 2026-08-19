# Schema.org JobPosting Monitoring (Sub-project 3a)

**Status:** Approved for planning
**Date:** 2026-08-18
**Sub-project:** 3a of 3 in the job-hunter-project differentiation roadmap (1: broaden main-feed ATS coverage — done; 2: fast ATS polling + staleness detection — done; 3a: this doc; 3b: Common Crawl/Web Data Commons bulk company discovery — deferred pending research)

## Context

The original sub-project 3 goal was "long-tail discovery via schema.org/JobPosting crawling — closing the coverage gap beyond known ATS companies." That turned out to be two fairly independent pieces: (a) actually being able to parse and monitor schema.org-structured job data once you have a company's career page URL, and (b) discovering brand-new company domains to point that capability at. This spec covers (a) only — (b) needs its own research pass into Common Crawl/Web Data Commons' actual access mechanics before it can be designed responsibly (an under-researched design directly caused two mid-execution corrections during sub-project 2).

Every company in the `watched_companies` table that isn't on one of the 7 known ATS platforms currently falls back to one of two "custom" monitoring tiers in `companyWatcher.js`:
- `handleCustomHash` — a raw, free fetch that only detects "the page changed," with no idea what changed.
- `handleCustomExtract` — context.dev-powered structured extraction, real job-level data, but costs 1 credit per check plus 10 credits whenever the page changes, and is rate-limited to once/hour per company specifically to control that cost.

Many companies without Greenhouse/Lever/Ashby/etc. still embed `schema.org JobPosting` structured data in their career pages — it's the same markup Google for Jobs relies on for indexing, so it's common enough to be worth targeting directly. Parsing it requires no paid API and gives the same real job-level data `handleCustomExtract` provides, for every check, not just once an hour.

## Goals

1. Companies whose career page embeds schema.org JobPosting data get real, job-level monitoring (title/url/location/posted date — not just "something changed") without consuming context.dev credits.
2. This capability integrates with the existing ATS-dispatch machinery (`isSupportedAts`, `fetchAtsJobs`, `processAtsJobs`, `runAtsWatch`) rather than duplicating it, so it automatically inherits the staleness/source-scoping correctness fixed in sub-project 2.
3. No database migration required — `watched_companies.ats_type` is already free-text.

## Non-goals (explicitly out of scope for this sub-project)

- **Crawling beyond a single fetch of the career page.** Many real-world sites only embed JobPosting markup on individual job *detail* pages, not on the listing/index page itself — the index page just links to them. Handling that pattern requires discovering those links (via sitemap.xml or link-scraping) and fetching each one, which is a meaningfully bigger, crawler-shaped piece of work. This sub-project only parses JobPosting data that's directly present on the one `career_url` already on file for a company. Sites that only use the per-job-page pattern will simply fall through to the existing `handleCustomExtract`/`handleCustomHash` tiers, exactly as they do today — no regression, just no improvement for that pattern yet.
- **Discovering brand-new companies** (sub-project 3b, deferred — see Context above).
- **Feeding schema.org-detected companies into the main hourly/fast-poll feed.** This sub-project only wires into the company *watchlist* (`companyWatcher.js`), which already has a per-company detection-and-monitoring flow to extend. The main feed (`scraper.js`/`fastPoll.js`) has no equivalent "custom company" concept at all today — building one would mean inventing a new company list and a new discovery mechanism with nothing yet to populate it from, which is really 3b's job once that's designed.
- **Using `validThrough` (schema.org's own listing-expiration field) as a staleness signal.** Interesting for later, but the existing diff-based closer sweep already covers "job disappeared from the page," which is the same signal sub-project 2 already handles correctly for other sources. Adding a second, independent staleness mechanism specific to one source is unnecessary scope for this pass.

## Architecture

### 1. Parsing primitives (`backend/src/utils/schemaOrgJobPostings.js`, new file)

Detection (`atsDetector.js`) and fetching (`atsFetchers.js`) both need to answer "does this HTML contain JobPosting data, and what is it" — that logic gets one shared, pure-function home rather than being duplicated or awkwardly imported from whichever of the two files happened to define it first. Neither existing file is the right owner: `atsDetector.js` does ATS *identification*, not content parsing, and `atsFetchers.js`'s existing helpers are all one-fetcher-per-ATS wrappers around well-known REST endpoints, not general HTML/JSON-LD parsing. This is a big enough, different enough kind of logic (arbitrary-HTML parsing, not a REST call) to warrant its own small file, per the project's existing convention of one clear responsibility per file.

```js
export function parseJobPostings(html) {
    // extracts every <script type="application/ld+json">...</script> block,
    // JSON-parses each (skipping ones that fail to parse — a page can have
    // multiple such blocks for unrelated structured data, e.g. breadcrumbs,
    // organization info; one bad block shouldn't sink the others), and
    // flattens every JobPosting-typed object found into a flat array —
    // whether a given script's root value is a single JobPosting object, an
    // array of them, or a @graph-wrapped collection. An object counts as a
    // JobPosting if its @type is exactly "JobPosting" or an array containing
    // "JobPosting". Returns [] if nothing matches (not an error).
}

export function formatJobLocation(posting) {
    // reads posting.jobLocation?.address (joining addressLocality/
    // addressRegion/addressCountry the same way fetchSmartRecruiters/
    // fetchWorkable already join their nested location fields), falling
    // back to 'Remote' when posting.jobLocationType === 'TELECOMMUTE' or
    // posting.applicantLocationRequirements is present, and to 'US'
    // otherwise — the same loc || (remote flag ? 'Remote' : 'US') fallback
    // chain already used by every fetcher in atsFetchers.js.
}
```

### 2. Detection (`backend/src/utils/atsDetector.js`)

`detectFromHTML(domain)` already fetches each career-path candidate and checks the response against `ATS_HTML_PATTERNS` (Greenhouse/Lever/Ashby/Workday/SmartRecruiters/Workable/Recruitee/iCIMS/Taleo/SuccessFactors regexes), falling back to `{ ats_type: 'custom', ats_slug: null, career_url: finalUrl }` when nothing matches. Before that fallback, import `parseJobPostings` and add a schema.org check: if `parseJobPostings(html).length > 0`, return `{ ats_type: 'schema-org', ats_slug: null, career_url: finalUrl, supported: true }` instead of falling through to `'custom'`.

The same check is added to `companyWatcher.js`'s `resolveEmbeddedAts` path (used both on first-time company checks and when an existing "custom" company's ATS needs re-resolving), so a company already sitting in the watchlist as `'custom'` gets upgraded to `'schema-org'` the next time its embedded-ATS resolution runs — consistent with how a company gets upgraded from `'custom'` to `'greenhouse'`/etc. today when an embedded ATS is discovered.

### 3. Fetching (`backend/src/watchers/atsFetchers.js`)

A new function, following the existing per-ATS fetcher pattern in this file, importing `parseJobPostings`/`formatJobLocation` from the new util file:

```js
import { parseJobPostings, formatJobLocation } from '../utils/schemaOrgJobPostings.js';

export async function fetchSchemaOrgJobs(careerUrl) {
    const resp = await fetch(careerUrl, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) throw new Error(`schema-org HTTP ${resp.status}`);
    const html = await resp.text();
    const postings = parseJobPostings(html);

    return postings.map(p => {
        const url = p.url || careerUrl;
        return {
            id: makeJobId(url),
            title: p.title || '',
            url,
            location: formatJobLocation(p),
            posted_at: p.datePosted ? new Date(p.datePosted).toISOString() : new Date().toISOString(),
            source: 'schema-org',
        };
    });
}
```

Add `'schema-org'` to `ATS_TYPES` (so `isSupportedAts('schema-org')` returns `true`) and a `case 'schema-org': return fetchSchemaOrgJobs(career_url);` branch to `fetchAtsJobs`'s dispatch switch.

### 4. Company watcher integration (`backend/src/watchers/companyWatcher.js`)

No new monitoring function is needed. Once a company's `ats_type` is `'schema-org'`, `watchOneCompany`'s existing first branch (`if (isSupportedAts(company.ats_type)) { return await runAtsWatch(company, ...); }`) already handles it — `runAtsWatch` calls `fetchAtsJobs`, which now knows how to dispatch to `fetchSchemaOrgJobs`, and hands the normalized result to `processAtsJobs`, exactly as it does for every other ATS type today. The only change in this file is in the "custom company" fallback path (`resolveEmbeddedAts` resolution, both on first check and on redetection after an ATS error) — schema.org detection is tried there, per the Detection section above.

### 5. Display (`frontend/src/lib/api.ts`, `frontend/src/app/page.tsx`)

Same small addition sub-projects 1 and 2 both needed for their new source values: add `'schema-org'` to `formatSource()`'s label map (e.g. `'Schema.org'`) and to the `SOURCES` filter dropdown array, so jobs from this source display and filter consistently with every other source.

## Testing

- `parseJobPostings` (`schemaOrgJobPostings.js`): a pure function (string in, array out) — unit tests covering a single JobPosting object, an array of JobPostings, a `@graph`-wrapped page, a page with multiple unrelated JSON-LD blocks (only the JobPosting ones should be extracted), a page with a malformed JSON-LD block alongside a valid one (the malformed one is skipped, the valid one still extracted), and a page with no JobPosting data at all (empty result, not an error).
- `formatJobLocation` (`schemaOrgJobPostings.js`): pure function — unit tests for the address-join case, the `TELECOMMUTE`/`applicantLocationRequirements` remote cases, and the no-location fallback.
- `fetchSchemaOrgJobs` (`atsFetchers.js`): mocked-fetch tests following the same pattern already established for `fetchSmartRecruiters`/`fetchWorkable`/`fetchRecruitee` in `atsFetchers.test.js` — asserting `id`/`url`/`location`/`posted_at` construction from a representative payload, with `parseJobPostings`/`formatJobLocation` exercised for real (not mocked, since they're pure and already covered directly).
- Detection: `atsDetector.js` and `companyWatcher.js`'s `resolveEmbeddedAts` gain schema.org as a possible detection outcome — extend their existing test coverage (or add it, matching whatever coverage those files already have at the time this is implemented) to confirm a page with JobPosting markup but no recognized ATS pattern resolves to `ats_type: 'schema-org'` rather than `'custom'`.

## Open questions / risks

- **False-positive risk**: some sites embed a single, generic "hiring page" JobPosting as SEO boilerplate rather than real per-role listings (a known pattern — one JobPosting object advertising "we're hiring, see our careers page" rather than one per actual role). This would show up as a single, static "job" that never seems to close or change. Not a correctness bug (it'll behave like any other slow-moving listing), but worth watching for in practice; no code mitigation planned for this pass.
- **HTML entity encoding**: job titles/locations extracted from JSON-LD occasionally contain HTML entities (`&amp;`, `&#39;`) if a site's templating layer double-encodes before embedding JSON — worth a quick decode pass if it shows up in practice, not designed for preemptively since it may not occur at all depending on how real target sites generate this markup.
