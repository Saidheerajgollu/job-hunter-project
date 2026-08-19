# Schema.org JobPosting Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give companies on the watchlist whose career page embeds schema.org JobPosting structured data real, free, job-level monitoring — replacing the costly/dumb `handleCustomExtract`/`handleCustomHash` fallbacks for that subset of companies.

**Architecture:** A new pure-parsing module extracts JobPosting data from raw HTML. It's consumed by two existing files: `atsDetector.js` (so new/redetected companies get classified as `schema-org` instead of `custom` when applicable) and `atsFetchers.js` (a new fetcher wired into the existing per-ATS dispatch table, plus the existing `resolveEmbeddedAts` embedded-ATS discovery function gains the same check). `companyWatcher.js` itself needs no changes — once a company's `ats_type` is `schema-org`, the existing `isSupportedAts`/`fetchAtsJobs`/`processAtsJobs` pipeline already handles it identically to Greenhouse/Lever/etc.

**Tech Stack:** Node.js/Express (ESM), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-schema-org-monitoring-design.md`

## Global Constraints

- New `ats_type` value: `schema-org` (exact string, matches the spec and the `source` value stored on jobs from this path).
- No database migration — `watched_companies.ats_type` and `jobs.source` are both free-text columns already.
- `parseJobPostings`/`formatJobLocation` live in a new file, `backend/src/utils/schemaOrgJobPostings.js` — not in `atsDetector.js` or `atsFetchers.js` directly, since both of those need to import it (see spec Architecture §1 for why neither existing file is the right owner).
- **`resolveEmbeddedAts` (in `atsFetchers.js`) builds `haystack` from context.dev-rendered *markdown* on a company's first-ever watch check (when `useContextDev` is true), and from raw HTML on every check after that.** Markdown conversion strips `<script>` tags, so `parseJobPostings` will find nothing on that first-check markdown path even when the page genuinely has JobPosting data — this is expected, not a bug: the company simply falls through to the existing custom-page fallback for one cycle, then gets correctly classified as `schema-org` on the *next* watch cycle (30 min later), when `resolveEmbeddedAts` runs again with `useContextDev = false` (raw HTML) because `last_job_hash` is set by then. Do not attempt to fix this by adding a second fetch — it is a deliberate, accepted, self-correcting limitation, not a defect to route around.
- **Both `backend/src/watchers/atsFetchers.js` and `backend/src/utils/atsDetector.js` have pre-existing, unrelated, uncommitted work-in-progress sitting in them already** (present since before this plan started — check `git diff HEAD -- <file>` before editing either). Isolate your own edits into the commit rather than a plain `git add` — the exact technique (`git apply --cached` with a hand-built patch, verified against the pre-edit and post-commit diffs) is documented in multiple prior task reports under `.superpowers/sdd/2026-08-17-fast-poll-staleness/` in this repo's git history (that plan's workspace directory has since been deleted, but the technique is described in this plan's task briefs directly — see Tasks 2 and 3 below). One incident during the prior plan involved an implementer accidentally *deleting* such WIP from the working tree rather than merely failing to commit it — verify after your edit that the pre-existing WIP is still present and unstaged, not just that your own change is committed.
- No feature flags, no backwards-compatibility shims.
- Commit messages: conventional commits, no `Co-Authored-By` trailer (standing project instruction).

---

## Task 1: schema.org JobPosting parsing primitives

**Files:**
- Create: `backend/src/utils/schemaOrgJobPostings.js`
- Test: `backend/src/utils/schemaOrgJobPostings.test.js`

**Interfaces:**
- Produces: `parseJobPostings(html: string) => object[]` — raw (un-normalized) JobPosting objects extracted from the HTML's `<script type="application/ld+json">` blocks. `[]` if none found.
- Produces: `formatJobLocation(posting: object) => string` — a display location string derived from one raw JobPosting object.
- Both consumed by Task 2 (`atsFetchers.js`) and Task 3 (`atsDetector.js`).

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { parseJobPostings, formatJobLocation } from './schemaOrgJobPostings.js';

describe('parseJobPostings', () => {
    it('extracts a single JobPosting object', () => {
        const html = `
            <html><head>
            <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"JobPosting","title":"Software Engineer","url":"https://example.com/jobs/1"}
            </script>
            </head></html>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Software Engineer');
    });

    it('extracts every JobPosting from an array', () => {
        const html = `
            <script type="application/ld+json">
            [
              {"@type":"JobPosting","title":"Backend Engineer","url":"https://example.com/jobs/1"},
              {"@type":"JobPosting","title":"Frontend Engineer","url":"https://example.com/jobs/2"}
            ]
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(2);
        expect(result.map(j => j.title)).toEqual(['Backend Engineer', 'Frontend Engineer']);
    });

    it('extracts JobPostings nested inside a @graph array', () => {
        const html = `
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                {"@type":"Organization","name":"Example Inc"},
                {"@type":"JobPosting","title":"Data Engineer","url":"https://example.com/jobs/3"}
              ]
            }
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Data Engineer');
    });

    it('ignores unrelated JSON-LD blocks and only extracts JobPosting ones', () => {
        const html = `
            <script type="application/ld+json">
            {"@type":"BreadcrumbList","itemListElement":[]}
            </script>
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"ML Engineer","url":"https://example.com/jobs/4"}
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('ML Engineer');
    });

    it('skips a malformed JSON-LD block but still extracts a valid one alongside it', () => {
        const html = `
            <script type="application/ld+json">
            { this is not valid json
            </script>
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"DevOps Engineer","url":"https://example.com/jobs/5"}
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('DevOps Engineer');
    });

    it('returns an empty array when there is no JobPosting data', () => {
        const html = `<html><body><h1>Careers</h1><p>No structured data here.</p></body></html>`;
        expect(parseJobPostings(html)).toEqual([]);
    });

    it('recognizes @type as an array containing JobPosting', () => {
        const html = `
            <script type="application/ld+json">
            {"@type":["JobPosting","Thing"],"title":"Platform Engineer","url":"https://example.com/jobs/6"}
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Platform Engineer');
    });
});

describe('formatJobLocation', () => {
    it('joins city/region/country from jobLocation.address', () => {
        const posting = {
            jobLocation: { address: { addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' } },
        };
        expect(formatJobLocation(posting)).toBe('Austin, TX, US');
    });

    it('falls back to Remote when jobLocationType is TELECOMMUTE', () => {
        const posting = { jobLocationType: 'TELECOMMUTE' };
        expect(formatJobLocation(posting)).toBe('Remote');
    });

    it('falls back to Remote when applicantLocationRequirements is present', () => {
        const posting = { applicantLocationRequirements: { '@type': 'Country', name: 'US' } };
        expect(formatJobLocation(posting)).toBe('Remote');
    });

    it('falls back to US when there is no location data at all', () => {
        expect(formatJobLocation({})).toBe('US');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/utils/schemaOrgJobPostings.test.js`
Expected: FAIL — `Cannot find module './schemaOrgJobPostings.js'`

- [ ] **Step 3: Write the minimal implementation**

```js
/**
 * Parses schema.org JobPosting structured data (the same JSON-LD markup
 * Google for Jobs indexes) directly out of a career page's raw HTML, with
 * no ATS integration needed. Consumed by atsDetector.js (to classify a
 * company as `schema-org` instead of `custom`) and atsFetchers.js (to
 * actually fetch job listings for one).
 */

// SECURITY NOTE (post-implementation): this regex is vulnerable to
// catastrophic backtracking (ReDoS) on adversarial HTML — do not copy it.
// The final whole-branch review and one follow-up fix replaced this
// approach entirely with a linear indexOf-based scan (extractScriptBlocks)
// in the actual implementation. See the committed backend/src/utils/schemaOrgJobPostings.js
// for the real, safe version — this snippet is left as-written for
// historical accuracy about what Task 1 originally implemented.
const SCRIPT_BLOCK_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function isJobPosting(value) {
    if (!value || typeof value !== 'object') return false;
    const type = value['@type'];
    if (typeof type === 'string') return type === 'JobPosting';
    if (Array.isArray(type)) return type.includes('JobPosting');
    return false;
}

function collectJobPostings(value, out) {
    if (Array.isArray(value)) {
        for (const item of value) collectJobPostings(item, out);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (isJobPosting(value)) out.push(value);
    if (Array.isArray(value['@graph'])) collectJobPostings(value['@graph'], out);
}

export function parseJobPostings(html) {
    const postings = [];
    for (const match of html.matchAll(SCRIPT_BLOCK_RE)) {
        let parsed;
        try {
            parsed = JSON.parse(match[1]);
        } catch {
            continue;
        }
        collectJobPostings(parsed, postings);
    }
    return postings;
}

export function formatJobLocation(posting) {
    const address = posting.jobLocation?.address;
    if (address) {
        const parts = [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean);
        if (parts.length) return parts.join(', ');
    }
    if (posting.jobLocationType === 'TELECOMMUTE' || posting.applicantLocationRequirements) {
        return 'Remote';
    }
    return 'US';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/utils/schemaOrgJobPostings.test.js`
Expected: PASS — 11/11 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/schemaOrgJobPostings.js backend/src/utils/schemaOrgJobPostings.test.js
git commit -m "feat: add schema.org JobPosting parsing primitives"
```

---

## Task 2: fetchSchemaOrgJobs and resolveEmbeddedAts extension (atsFetchers.js)

**Files:**
- Modify: `backend/src/watchers/atsFetchers.js`
- Modify: `backend/src/watchers/atsFetchers.test.js`

**Interfaces:**
- Consumes: `parseJobPostings`, `formatJobLocation` from `../utils/schemaOrgJobPostings.js` (Task 1).
- Produces: `fetchSchemaOrgJobs(careerUrl) => Promise<{id, title, url, location, posted_at, source}[]>` — consumed by `fetchAtsJobs`'s own dispatch (same file) and, indirectly through that dispatch, by `companyWatcher.js` (no changes needed there).
- `isSupportedAts('schema-org')` must return `true` after this task.
- `resolveEmbeddedAts` gains schema.org as a possible return type: `{ ats_type: 'schema-org', ats_slug: null, career_url: <the URL actually fetched> }`.

**Before starting:** this file has pre-existing, unrelated, uncommitted work-in-progress. Run `git diff HEAD -- backend/src/watchers/atsFetchers.js` and note what's there before making any edit, so you can confirm afterward it's still present and unstaged. Isolate your commit to only the changes below — build a patch of just your own diff and apply it with `git apply --cached` rather than `git add`-ing the whole file. Verify with `git diff --cached -- backend/src/watchers/atsFetchers.js` (should show only your changes) and `git diff HEAD -- backend/src/watchers/atsFetchers.js` after committing (should show the pre-existing WIP, unchanged from before you started).

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/watchers/atsFetchers.test.js` (this file already exists with tests for `fetchSmartRecruiters`/`fetchWorkable`/`fetchRecruitee`, using a JSON-specific `mockFetchOk(body)` helper at the top of the file — `fetchSchemaOrgJobs` and `resolveEmbeddedAts` both consume raw HTML via `.text()`, not JSON via `.json()`, so add a second helper alongside the existing one rather than overloading it):

```js
import { fetchSchemaOrgJobs, resolveEmbeddedAts, isSupportedAts } from './atsFetchers.js';

function mockFetchHtml(html) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
    }));
}

describe('fetchSchemaOrgJobs', () => {
    it('parses JobPosting data from the career page and normalizes it', async () => {
        mockFetchHtml(`
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"Software Engineer","url":"https://example.com/jobs/1","datePosted":"2026-01-01T00:00:00.000Z","jobLocation":{"address":{"addressLocality":"Austin","addressRegion":"TX"}}}
            </script>
        `);

        const [job] = await fetchSchemaOrgJobs('https://example.com/careers');

        expect(job.title).toBe('Software Engineer');
        expect(job.url).toBe('https://example.com/jobs/1');
        expect(job.location).toBe('Austin, TX');
        expect(job.posted_at).toBe('2026-01-01T00:00:00.000Z');
        expect(job.source).toBe('schema-org');
    });

    it('falls back to the career page URL when a posting has no url field', async () => {
        mockFetchHtml(`
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"Backend Engineer"}
            </script>
        `);

        const [job] = await fetchSchemaOrgJobs('https://example.com/careers');

        expect(job.url).toBe('https://example.com/careers');
    });

    it('throws on a non-OK response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        await expect(fetchSchemaOrgJobs('https://example.com/careers')).rejects.toThrow('schema-org HTTP 500');
    });
});

describe('isSupportedAts', () => {
    it('recognizes schema-org as a supported ATS type', () => {
        expect(isSupportedAts('schema-org')).toBe(true);
    });
});

describe('resolveEmbeddedAts — schema.org detection', () => {
    it('returns ats_type schema-org when the page has JobPosting data but no recognized ATS URL pattern', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            url: 'https://example.com/careers',
            text: async () => `
                <script type="application/ld+json">
                {"@type":"JobPosting","title":"Site Reliability Engineer","url":"https://example.com/jobs/9"}
                </script>
            `,
        }));

        const result = await resolveEmbeddedAts('https://example.com/careers', false);

        expect(result).toEqual({
            ats_type: 'schema-org',
            ats_slug: null,
            career_url: 'https://example.com/careers',
        });
    });

    it('still prefers a recognized ATS URL pattern over schema.org data when both are present', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            url: 'https://example.com/careers',
            text: async () => `
                <a href="https://boards.greenhouse.io/testco">Apply here</a>
                <script type="application/ld+json">
                {"@type":"JobPosting","title":"Also Listed Here","url":"https://example.com/jobs/10"}
                </script>
            `,
        }));

        const result = await resolveEmbeddedAts('https://example.com/careers', false);

        expect(result.ats_type).toBe('greenhouse');
    });

    it('returns null when there is neither a recognized ATS pattern nor JobPosting data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            url: 'https://example.com/careers',
            text: async () => `<html><body>Just a plain careers page.</body></html>`,
        }));

        const result = await resolveEmbeddedAts('https://example.com/careers', false);

        expect(result).toBeNull();
    });
});
```

Note: `import { fetchSchemaOrgJobs, resolveEmbeddedAts, isSupportedAts } from './atsFetchers.js';` at the top of the test code above should be merged into the file's existing `import { fetchSmartRecruiters, fetchWorkable, fetchRecruitee } from './atsFetchers.js';` line (one combined import), not added as a second, separate import line for the same module.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/watchers/atsFetchers.test.js`
Expected: FAIL — `fetchSchemaOrgJobs`/schema-org detection don't exist yet; `isSupportedAts('schema-org')` returns `false`

- [ ] **Step 3: Add the import and fetchSchemaOrgJobs**

Near the top of `backend/src/watchers/atsFetchers.js`, alongside the existing `makeJobId`/`scrapeMarkdown` imports:

```js
import { parseJobPostings, formatJobLocation } from '../utils/schemaOrgJobPostings.js';
```

Add this function alongside the other per-ATS fetchers (e.g. after `fetchRecruitee`, before the `parseWorkdayUrl`/`fetchWorkday` section):

```js
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

- [ ] **Step 4: Add schema-org to ATS_TYPES and the fetchAtsJobs dispatch**

Change:
```js
const ATS_TYPES = new Set([
    'greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee',
]);
```
to:
```js
const ATS_TYPES = new Set([
    'greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee', 'schema-org',
]);
```

In `fetchAtsJobs`'s dispatch switch, add:
```js
        case 'schema-org': return fetchSchemaOrgJobs(career_url);
```
(placed alongside the other `case` entries, before the `default: throw ...` line).

- [ ] **Step 5: Extend resolveEmbeddedAts to check for schema.org data**

In `resolveEmbeddedAts`, after the existing `for (const { type, regex } of ATS_URL_PATTERNS) { ... }` loop falls through without finding a match (i.e., right before the function's final `return null;`), add a schema.org check. The function currently ends like this:

```js
    for (const { type, regex } of ATS_URL_PATTERNS) {
        const match = haystack.match(regex);
        if (!match) continue;

        if (type === 'workday') {
            return { ats_type: 'workday', ats_slug: null, career_url: match[0] };
        }
        const slug = match[1];
        if (!slug || slug.length < 2) continue;
        const canonical = {
            greenhouse: `https://boards.greenhouse.io/${slug}`,
            lever: `https://jobs.lever.co/${slug}`,
            ashby: `https://jobs.ashbyhq.com/${slug}`,
            smartrecruiters: `https://careers.smartrecruiters.com/${slug}`,
            workable: `https://apply.workable.com/${slug}`,
            recruitee: `https://${slug}.recruitee.com`,
        }[type] || finalUrl;
        return { ats_type: type, ats_slug: slug, career_url: canonical };
    }
    return null;
}
```

Change the final two lines to:

```js
    }

    if (parseJobPostings(haystack).length > 0) {
        return { ats_type: 'schema-org', ats_slug: null, career_url: finalUrl };
    }

    return null;
}
```

Note this reuses the same `haystack` the function already built (either markdown or raw HTML, per the `useContextDev` branch above it) — no extra network call. See this plan's Global Constraints for why the markdown path won't find anything even when JobPosting data exists, and why that's expected.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/watchers/atsFetchers.test.js`
Expected: PASS — all tests in the file, including the new ones

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS — every test file

- [ ] **Step 8: Verify WIP isolation and commit**

Confirm `git diff HEAD -- backend/src/watchers/atsFetchers.js` still shows the pre-existing WIP noted at the start of this task, unchanged. Then:

```bash
git add backend/src/watchers/atsFetchers.js backend/src/watchers/atsFetchers.test.js
git commit -m "feat: add fetchSchemaOrgJobs and schema.org detection in resolveEmbeddedAts"
```

(If isolating `atsFetchers.js` from pre-existing WIP required the `git apply --cached` technique, stage `atsFetchers.test.js` normally with `git add` — it's a new-ish file being extended with no unrelated WIP of its own — and combine both into one commit as shown.)

---

## Task 3: atsDetector.js schema.org detection

**Files:**
- Modify: `backend/src/utils/atsDetector.js`
- Test: `backend/src/utils/atsDetector.test.js` (new)

**Interfaces:**
- Consumes: `parseJobPostings` from `./schemaOrgJobPostings.js` (Task 1; same directory, so a relative import of `./schemaOrgJobPostings.js`).
- `detectFromHTML(domain)` gains a new possible return value: `{ ats_type: 'schema-org', ats_slug: null, career_url: finalUrl }` (in addition to its existing greenhouse/lever/ashby/workday/smartrecruiters/workable/recruitee/custom/unknown outcomes).
- `detectATS(name, domain)` (the outer function that calls `detectFromHTML` as its fallback) automatically gains this too, with no changes needed to `detectATS` itself — consumed by `POST /api/companies/detect` (`server.js`) and the watchlist's own redetection flow, both unchanged by this task.

**Before starting:** this file has pre-existing, unrelated, uncommitted work-in-progress. Run `git diff HEAD -- backend/src/utils/atsDetector.js` and note what's there before making any edit. Isolate your commit the same way as Task 2 — see that task's note on the `git apply --cached` technique if a plain `git add` would sweep up more than your own change.

- [ ] **Step 1: Write the failing tests**

`backend/src/utils/atsDetector.test.js` (new file — this file has no existing test coverage; keep this focused on the new schema.org behavior, not a retroactive full-file test suite):

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectATS } from './atsDetector.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('detectATS — schema.org fallback', () => {
    it('returns ats_type schema-org when the career page has JobPosting data but no recognized ATS', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            // Greenhouse/Lever/Ashby slug probes all fail (simulate no matching board).
            if (String(url).includes('boards-api.greenhouse.io') ||
                String(url).includes('api.lever.co') ||
                String(url).includes('api.ashbyhq.com')) {
                return { ok: false, status: 404 };
            }
            // The HTML-detection career-page fetch succeeds with JobPosting data.
            return {
                ok: true,
                redirect: 'follow',
                url: 'https://careers.testco.com',
                text: async () => `
                    <script type="application/ld+json">
                    {"@type":"JobPosting","title":"Product Engineer","url":"https://testco.com/jobs/1"}
                    </script>
                `,
            };
        }));

        const result = await detectATS('TestCo', 'testco.com');

        expect(result.ats_type).toBe('schema-org');
        expect(result.supported).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/utils/atsDetector.test.js`
Expected: FAIL — `ats_type` comes back `'unknown'` or `'custom'`, not `'schema-org'`

- [ ] **Step 3: Add the import and the schema.org check**

Near the top of `backend/src/utils/atsDetector.js`, alongside the existing imports:

```js
import { parseJobPostings } from './schemaOrgJobPostings.js';
```

In `detectFromHTML`, the loop over `ATS_HTML_PATTERNS` currently falls through to:

```js
            // Found a career page but no recognizable ATS signature.
            return { ats_type: 'custom', ats_slug: null, career_url: finalUrl };
```

Change this to check for schema.org data first:

```js
            // Found a career page but no recognizable ATS signature — check
            // for schema.org JobPosting data before falling back to 'custom'.
            if (parseJobPostings(searchText).length > 0) {
                return { ats_type: 'schema-org', ats_slug: null, career_url: finalUrl };
            }
            return { ats_type: 'custom', ats_slug: null, career_url: finalUrl };
```

(`searchText` is the variable this function already builds as `finalUrl + '\n' + markdown` or `finalUrl + '\n' + await resp.text()`, depending on whether `contextDevEnabled()` — same markdown-vs-raw-HTML consideration as Task 2's `resolveEmbeddedAts`, and the same accepted limitation applies here.)

Also update `detectATS`'s `supported` check, which currently reads:

```js
        const supported = ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee'].includes(result.ats_type);
```

Add `'schema-org'` to that array so it's marked `supported: true` like every other real ATS type, not treated like `'custom'`:

```js
        const supported = ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee', 'schema-org'].includes(result.ats_type);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/utils/atsDetector.test.js`
Expected: PASS — 1/1 test

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npx vitest run`
Expected: PASS — every test file

- [ ] **Step 6: Verify WIP isolation and commit**

Confirm `git diff HEAD -- backend/src/utils/atsDetector.js` still shows the pre-existing WIP noted at the start of this task, unchanged. Then:

```bash
git add backend/src/utils/atsDetector.js backend/src/utils/atsDetector.test.js
git commit -m "feat: detect schema.org JobPosting data as a supported ATS type"
```

---

## Task 4: Frontend display labels

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:** None — this is a display-only change, no new types or functions consumed elsewhere.

No test framework exists in the frontend (matches this repo's existing state, same as prior sub-projects' frontend tasks). Verify with `npx tsc --noEmit` and a read-through.

- [ ] **Step 1: Add the source label**

In `frontend/src/app/page.tsx`'s `formatSource` function, the `labels` map currently ends with:

```ts
        himalayas: 'Himalayas', weworkremotely: 'WWR',
        smartrecruiters: 'SmartRecruiters', workable: 'Workable', recruitee: 'Recruitee',
    };
```

Add `'schema-org': 'Schema.org'` to this map:

```ts
        himalayas: 'Himalayas', weworkremotely: 'WWR',
        smartrecruiters: 'SmartRecruiters', workable: 'Workable', recruitee: 'Recruitee',
        'schema-org': 'Schema.org',
    };
```

- [ ] **Step 2: Add the source filter option**

In the `SOURCES` array (used for the feed's source filter dropdown), add an entry after `recruitee`:

```ts
    { value: 'recruitee', label: 'Recruitee' },
    { value: 'schema-org', label: 'Schema.org' },
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add Schema.org source label and filter option"
```
