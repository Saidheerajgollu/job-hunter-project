/**
 * Jobicy Remote Jobs API Scraper — free, no key required
 *
 * Jobicy aggregates remote-first jobs with structured JSON.
 * Good supplement for remote SWE/data roles not on other sources.
 *
 * API docs: https://jobicy.com/jobs-rss-feed
 * Endpoint: https://jobicy.com/api/v2/remote-jobs
 * Limit:    50 results per request. ToS: do not re-publish listings.
 */

import { makeJobId, isSeniorRole, classifyCategory, isUSCompatible, sleep } from '../utils/helpers.js';

const BASE = 'https://jobicy.com/api/v2/remote-jobs';

// Industry + tag combos that cover tech new-grad roles
const QUERIES = [
    { industry: 'software', tag: 'software-engineer' },
    { industry: 'software', tag: 'backend' },
    { industry: 'software', tag: 'frontend' },
    { industry: 'data-science',   tag: 'data-scientist' },
    { industry: 'data-science',   tag: 'machine-learning' },
    { industry: 'devops-sysadmin', tag: 'devops' },
];

async function fetchJobicy(industry, tag) {
    const params = new URLSearchParams({
        count: '50',
        geo: 'usa',
        industry,
        tag,
    });

    const resp = await fetch(`${BASE}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
        signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.jobs || [];
}

export async function scrapeJobicy(filterSenior = true) {
    const jobs = [];
    const seenUrls = new Set();

    for (const { industry, tag } of QUERIES) {
        try {
            const results = await fetchJobicy(industry, tag);

            for (const job of results) {
                const url = job.url;
                if (!url || seenUrls.has(url)) continue;
                seenUrls.add(url);

                const title = job.jobTitle || '';
                if (filterSenior && isSeniorRole(title)) continue;

                const location = job.jobGeo || 'Remote';
                if (!isUSCompatible(location)) continue;

                const category = classifyCategory(title);
                if (!category) continue;

                const salary = (job.salaryMin && job.salaryMax)
                    ? `$${Math.round(job.salaryMin / 1000)}k–$${Math.round(job.salaryMax / 1000)}k`
                    : null;

                jobs.push({
                    id: makeJobId(url),
                    title,
                    company: job.companyName || 'Unknown',
                    location: location === 'Anywhere' ? 'Remote' : location,
                    url,
                    source: 'jobicy',
                    category,
                    salary,
                    description: null,
                    posted_at: job.pubDate
                        ? new Date(job.pubDate).toISOString()
                        : new Date().toISOString(),
                });
            }

            await sleep(400);
        } catch (err) {
            console.error(`❌ Jobicy [${industry}/${tag}]: ${err.message}`);
        }
    }

    console.log(`📦 Jobicy: ${jobs.length} remote tech jobs`);
    return jobs;
}
