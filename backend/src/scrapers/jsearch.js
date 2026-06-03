/**
 * JSearch Scraper (via RapidAPI)
 * Aggregates results from LinkedIn, Indeed, Glassdoor, ZipRecruiter, and Google Jobs.
 * This is the catch-all for companies not on Greenhouse / Lever / Ashby —
 * e.g. Walmart, Target, FAANG internals, or any company with a custom ATS.
 *
 * Rate limit: designed for ≤ 500 req/month (free tier).
 * Runs on a SEPARATE 12-hour schedule (not the hourly API scraper).
 *
 * Env: RAPIDAPI_KEY  (set in .env or Railway environment)
 */

import { makeJobId, isSeniorRole, classifyCategory, sleep, isUSCompatible } from '../utils/helpers.js';

const RAPIDAPI_HOST = 'jsearch.p.rapidapi.com';

// 4 queries × 2 pages (num_b_pages) each = 4 API calls per run.
// 4 calls × 2 runs/day × 30 days = 240 calls/month (well within 500 free tier).
const SEARCH_QUERIES = [
    'new grad software engineer 2026',
    'entry level software engineer new graduate',
    'new grad machine learning data engineer 2026',
    'software engineer associate new graduate 2025 2026',
];

async function searchJSearch(apiKey, query) {
    const url = new URL(`https://${RAPIDAPI_HOST}/search`);
    url.searchParams.set('query', query);
    url.searchParams.set('page', '1');
    url.searchParams.set('num_b_pages', '2'); // 20 results in 1 API call
    url.searchParams.set('date_posted', 'today');
    url.searchParams.set('country', 'us');

    const resp = await fetch(url.toString(), {
        headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
        signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`JSearch HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    return data.data || [];
}

const NEW_GRAD_KEYWORDS = [
    'new grad', 'new graduate', 'entry level', 'entry-level',
    'junior', '0-2', '2025', '2026', 'associate', 'early career',
    'university', 'campus', 'sde i', 'swe i', 'level 1', 'level i',
];

function isNewGradRole(title, desc = '') {
    const text = (title + ' ' + desc.slice(0, 300)).toLowerCase();
    return NEW_GRAD_KEYWORDS.some(kw => text.includes(kw));
}

export async function scrapeJSearch(filterSenior = true) {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey || apiKey === 'your_rapidapi_key_here') {
        console.warn('⚠️  JSearch: RAPIDAPI_KEY not set — skipping');
        return [];
    }

    const jobs = [];
    const seen = new Set(); // dedup within this run by job_id

    for (const query of SEARCH_QUERIES) {
        try {
            const results = await searchJSearch(apiKey, query);

            for (const item of results) {
                const jobId = item.job_id;
                if (!jobId || seen.has(jobId)) continue;
                seen.add(jobId);

                const title = item.job_title || '';
                if (!isNewGradRole(title, item.job_description || '')) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const applyUrl = item.job_apply_link || item.job_google_link;
                if (!applyUrl) continue;

                const location = [item.job_city, item.job_state, item.job_country]
                    .filter(Boolean)
                    .join(', ') || 'US';

                if (!isUSCompatible(location)) continue;

                const postedAt = item.job_posted_at_datetime_utc
                    ? new Date(item.job_posted_at_datetime_utc).toISOString()
                    : new Date().toISOString();

                const salary = item.job_min_salary && item.job_max_salary
                    ? `$${Math.round(item.job_min_salary / 1000)}k–$${Math.round(item.job_max_salary / 1000)}k`
                    : null;

                jobs.push({
                    id: makeJobId(applyUrl),
                    title,
                    company: item.employer_name || 'Unknown',
                    location,
                    url: applyUrl,
                    source: 'jsearch',
                    category: classifyCategory(title, (item.job_description || '').slice(0, 500)),
                    salary,
                    description: item.job_description ? item.job_description.slice(0, 500) : null,
                    posted_at: postedAt,
                });
            }

            console.log(`✅ JSearch ["${query}"]: ${results.length} results, ${jobs.length} total so far`);
            await sleep(500); // be polite between queries
        } catch (err) {
            console.error(`❌ JSearch ["${query}"]: ${err.message}`);
        }
    }

    return jobs;
}
