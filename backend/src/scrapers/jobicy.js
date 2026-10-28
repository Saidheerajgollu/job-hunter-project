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

import { makeJobId, isSeniorRole, classifyCategory, isUSCompatible, sleep, toIsoDate } from '../utils/helpers.js';

const BASE = 'https://jobicy.com/api/v2/remote-jobs';

// Jobicy industry slugs (from https://jobicy.com/api/v2/remote-jobs?get=industries).
// The old slugs ("software", "devops-sysadmin") are rejected with HTTP 400, and
// combining industry + tag narrowed results to near zero, so we query by
// industry only and let classifyCategory pick out the tech roles.
const QUERIES = [
    { industry: 'engineering' },    // Software Engineering
    { industry: 'data-science' },   // Data Science & Analytics
    { industry: 'admin' },          // DevOps & Infrastructure
    { industry: 'cybersecurity' },
];

async function fetchJobicy(industry) {
    const params = new URLSearchParams({
        count: '50',
        geo: 'usa',
        industry,
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

    for (const { industry } of QUERIES) {
        try {
            const results = await fetchJobicy(industry);

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
                    posted_at: toIsoDate(job.pubDate),
                });
            }

            await sleep(400);
        } catch (err) {
            console.error(`❌ Jobicy [${industry}]: ${err.message}`);
        }
    }

    console.log(`📦 Jobicy: ${jobs.length} remote tech jobs`);
    return jobs;
}
