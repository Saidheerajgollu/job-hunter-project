/**
 * USAJobs API Scraper — free, requires API key registration
 *
 * Covers all US federal government positions: NSF, DOE, NASA, NIH, NIST,
 * national labs, DoD research. Includes "Recent Graduates" pathway postings
 * (the Pathways Program for students/recent grads).
 *
 * Get a free API key: https://developer.usajobs.gov/APIRequest/Index
 * Env:
 *   USAJOBS_API_KEY   — required (from developer.usajobs.gov)
 *   USAJOBS_EMAIL     — required (your email, used as User-Agent per spec)
 */

import { makeJobId, isSeniorRole, classifyCategory, sleep } from '../utils/helpers.js';

const BASE = 'https://data.usajobs.gov/api/search';

// Keywords targeting tech new-grad roles in government/research
const SEARCH_QUERIES = [
    { keyword: 'software engineer', hiringPath: 'recent-graduates' },
    { keyword: 'data scientist',    hiringPath: 'recent-graduates' },
    { keyword: 'data engineer',     hiringPath: 'recent-graduates' },
    { keyword: 'machine learning',  hiringPath: 'recent-graduates' },
    { keyword: 'software engineer', hiringPath: 'students' },
    { keyword: 'computer scientist', hiringPath: 'recent-graduates' },
];

async function fetchUSAJobs(keyword, hiringPath) {
    const apiKey = process.env.USAJOBS_API_KEY;
    const email  = process.env.USAJOBS_EMAIL;

    const params = new URLSearchParams({
        Keyword: keyword,
        HiringPath: hiringPath,
        ResultsPerPage: '50',
        Fields: 'min',
    });

    const resp = await fetch(`${BASE}?${params}`, {
        headers: {
            'Authorization-Key': apiKey,
            'User-Agent': email,
            'Host': 'data.usajobs.gov',
        },
        signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.SearchResult?.SearchResultItems || [];
}

export async function scrapeUSAJobs(filterSenior = true) {
    const apiKey = process.env.USAJOBS_API_KEY;
    const email  = process.env.USAJOBS_EMAIL;

    if (!apiKey || !email) {
        console.log('ℹ️  USAJobs skipped: set USAJOBS_API_KEY + USAJOBS_EMAIL to enable');
        return [];
    }

    const jobs = [];
    const seenIds = new Set();

    for (const { keyword, hiringPath } of SEARCH_QUERIES) {
        try {
            const items = await fetchUSAJobs(keyword, hiringPath);

            for (const item of items) {
                const desc = item.MatchedObjectDescriptor;
                if (!desc) continue;

                const url = desc.PositionURI || desc.ApplyURI?.[0];
                if (!url || seenIds.has(url)) continue;
                seenIds.add(url);

                const title = desc.PositionTitle || '';
                if (filterSenior && isSeniorRole(title)) continue;

                const category = classifyCategory(title);
                if (!category) continue;

                const location = desc.PositionLocation?.map(l => l.LocationName).join(', ') || 'United States';

                // Salary range from remuneration
                let salary = null;
                const pay = desc.PositionRemuneration?.[0];
                if (pay?.MinimumRange && pay?.MaximumRange) {
                    const min = Math.round(Number(pay.MinimumRange) / 1000);
                    const max = Math.round(Number(pay.MaximumRange) / 1000);
                    salary = `$${min}k–$${max}k`;
                }

                jobs.push({
                    id: makeJobId(url),
                    title,
                    company: desc.OrganizationName || 'US Federal Government',
                    location,
                    url,
                    source: 'usajobs',
                    category,
                    salary,
                    description: null,
                    posted_at: desc.PublicationStartDate
                        ? new Date(desc.PublicationStartDate).toISOString()
                        : new Date().toISOString(),
                });
            }

            await sleep(500);
        } catch (err) {
            console.error(`❌ USAJobs [${keyword}/${hiringPath}]: ${err.message}`);
        }
    }

    console.log(`📦 USAJobs: ${jobs.length} government/research tech jobs`);
    return jobs;
}
