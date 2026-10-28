/**
 * ByteDance / TikTok Scraper — the public job-search API behind
 * lifeattiktok.com and jobs.bytedance.com, no key.
 *   POST https://api.lifeattiktok.com/api/v1/public/supplier/search/job/posts
 *   POST https://jobs.bytedance.com/api/v1/search/job/posts
 * Body: { keyword, limit (≤100), offset }. Locations come as a nested
 * city → state → country chain, so US filtering is exact. The API returns no
 * posting date, so dates are marked estimated (first time we saw it).
 */

import { sleep, CAREER_SITE_TERMS, fetchWithRetry } from '../utils/helpers.js';
import { toCareerSiteJob, dedupeByUrl } from './careerSiteCommon.js';

const PAGE_SIZE = 100;
const PAGES_PER_TERM = 2;

const SITES = [
    {
        company: 'TikTok',
        endpoint: 'https://api.lifeattiktok.com/api/v1/public/supplier/search/job/posts',
        headers: { 'website-path': 'tiktok' },
        body: {},
        jobUrl: id => `https://lifeattiktok.com/search/${id}`,
    },
    {
        company: 'ByteDance',
        endpoint: 'https://jobs.bytedance.com/api/v1/search/job/posts',
        headers: { 'website-path': 'en' },
        body: { portal_type: 2 },
        jobUrl: id => `https://jobs.bytedance.com/en/position/${id}/detail`,
    },
];

function locationChain(city) {
    const parts = [];
    for (let node = city; node; node = node.parent) {
        const name = node.en_name || node.i18n_name || node.name;
        if (name) parts.push(name);
    }
    return parts;
}

// jobs.bytedance.com returns a bare city (no state/country parents), and its
// offices span China, Singapore, Europe... so a bare city must be a known US office.
const US_OFFICE_CITIES = new Set([
    'san jose', 'mountain view', 'sunnyvale', 'palo alto', 'san francisco', 'menlo park',
    'seattle', 'bellevue', 'los angeles', 'culver city', 'new york', 'austin', 'chicago',
    'washington', 'washington dc', 'washington d.c.', 'boston', 'atlanta', 'miami', 'nashville',
]);

function isUsChain(chain) {
    if (!chain.length) return false;
    if (chain.length > 1) return /united states/i.test(chain[chain.length - 1]);
    return US_OFFICE_CITIES.has(chain[0].toLowerCase());
}

export function parseByteDanceJob(post, site, filterSenior) {
    const chain = locationChain(post.city_info);
    // Country is the last link in the chain; require it to be the US.
    if (!isUsChain(chain)) return null;
    return toCareerSiteJob({
        title: post.title,
        company: site.company,
        location: chain.join(', '),
        url: site.jobUrl(post.id),
        source: 'bytedance',
        postedAt: new Date().toISOString(),
        postedAtEstimated: true,
        description: post.description,
    }, filterSenior);
}

export async function scrapeByteDance(filterSenior = true) {
    const jobs = [];
    for (const site of SITES) {
        let siteCount = 0;
        for (const term of CAREER_SITE_TERMS) {
            for (let page = 0; page < PAGES_PER_TERM; page++) {
                try {
                    const resp = await fetchWithRetry(site.endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...site.headers },
                        body: JSON.stringify({
                            keyword: term, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
                            job_category_id_list: [], location_code_list: [], subject_id_list: [], recruitment_id_list: [],
                            ...site.body,
                        }),
                    });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const data = await resp.json();
                    if (data.code !== 0) throw new Error(`API code ${data.code}: ${data.message}`);
                    const posts = data.data?.job_post_list || [];
                    for (const post of posts) {
                        const job = parseByteDanceJob(post, site, filterSenior);
                        if (job) { jobs.push(job); siteCount++; }
                    }
                    if (posts.length < PAGE_SIZE) break;
                    await sleep(500);
                } catch (err) {
                    console.error(`❌ ${site.company} [${term}]: ${err.message}`);
                    break;
                }
            }
        }
        console.log(`✅ ${site.company}: ${siteCount} US tech jobs (before dedupe)`);
    }
    return dedupeByUrl(jobs);
}
