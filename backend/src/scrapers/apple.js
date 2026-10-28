/**
 * Apple Jobs Scraper — jobs.apple.com, no key.
 * The site has no usable JSON API; search results are server-rendered into a
 * React Router hydration blob (window.__staticRouterHydrationData), 20 per page.
 */

import { sleep, CAREER_SITE_TERMS, fetchWithRetry } from '../utils/helpers.js';
import { toCareerSiteJob, dedupeByUrl } from './careerSiteCommon.js';

const BASE = 'https://jobs.apple.com';
const PAGE_SIZE = 20;
const PAGES_PER_TERM = 3;

const BLOB_RE = /__staticRouterHydrationData\s*=\s*JSON\.parse\(("(?:[^"\\]|\\.)*")\)/;

export function parseAppleHtml(html, filterSenior) {
    const m = html.match(BLOB_RE);
    if (!m) throw new Error('no hydration data in page (markup changed?)');
    const search = JSON.parse(JSON.parse(m[1]))?.loaderData?.search || {};
    const jobs = [];
    for (const r of search.searchResults || []) {
        const loc = (r.locations || [])[0] || {};
        const job = toCareerSiteJob({
            title: r.postingTitle,
            company: 'Apple',
            location: [loc.name, loc.countryName].filter(Boolean).join(', '),
            url: `${BASE}/en-us/details/${r.positionId}/${r.transformedPostingTitle || ''}`,
            source: 'apple',
            postedAt: r.postDateInGMT || r.postingDate,
        }, filterSenior);
        if (job) jobs.push(job);
    }
    return { jobs, total: search.totalRecords || 0, rows: (search.searchResults || []).length };
}

export async function scrapeApple(filterSenior = true) {
    const jobs = [];
    for (const term of CAREER_SITE_TERMS) {
        for (let page = 1; page <= PAGES_PER_TERM; page++) {
            try {
                const params = new URLSearchParams({ search: term, sort: 'relevance', location: 'united-states-USA', page: String(page) });
                const resp = await fetchWithRetry(`${BASE}/en-us/search?${params}`);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const { jobs: pageJobs, rows } = parseAppleHtml(await resp.text(), filterSenior);
                jobs.push(...pageJobs);
                if (rows < PAGE_SIZE) break;
                await sleep(600);
            } catch (err) {
                console.error(`❌ Apple [${term}]: ${err.message}`);
                break;
            }
        }
    }
    const out = dedupeByUrl(jobs);
    console.log(`✅ Apple: ${out.length} tech jobs`);
    return out;
}
