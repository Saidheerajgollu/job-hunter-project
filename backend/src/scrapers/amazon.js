/**
 * Amazon Jobs Scraper — amazon.jobs public search JSON, no key.
 *   GET https://www.amazon.jobs/en/search.json?base_query=..&loc_query=..&sort=recent
 * Up to 100 results per page (server cap), newest first.
 */

import { sleep, CAREER_SITE_TERMS, fetchWithRetry } from '../utils/helpers.js';
import { toCareerSiteJob, dedupeByUrl } from './careerSiteCommon.js';

const ORIGIN = 'https://www.amazon.jobs';
const PAGE_SIZE = 100;
const PAGES_PER_TERM = 2;

export function parseAmazonJob(row, filterSenior) {
    const path = row.job_path || '';
    return toCareerSiteJob({
        title: row.title,
        company: 'Amazon',
        location: row.normalized_location || row.location,
        url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
        source: 'amazon',
        postedAt: row.posted_date,
        description: row.description_short,
    }, filterSenior);
}

export async function scrapeAmazon(filterSenior = true) {
    const jobs = [];
    for (const term of CAREER_SITE_TERMS) {
        for (let page = 0; page < PAGES_PER_TERM; page++) {
            try {
                const params = new URLSearchParams({
                    base_query: term, loc_query: 'United States', country: 'USA',
                    sort: 'recent', result_limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE),
                });
                const resp = await fetchWithRetry(`${ORIGIN}/en/search.json?${params}`, { headers: { Accept: 'application/json' } });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const rows = (await resp.json()).jobs || [];
                for (const row of rows) {
                    const job = parseAmazonJob(row, filterSenior);
                    if (job) jobs.push(job);
                }
                if (rows.length < PAGE_SIZE) break;
                await sleep(500);
            } catch (err) {
                console.error(`❌ Amazon [${term}]: ${err.message}`);
                break;
            }
        }
    }
    const out = dedupeByUrl(jobs);
    console.log(`✅ Amazon: ${out.length} tech jobs`);
    return out;
}
