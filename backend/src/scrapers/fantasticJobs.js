/**
 * Fantastic.jobs — "Active Jobs DB" scraper (via RapidAPI)
 *
 * Optional broad-coverage source. Fantastic.jobs aggregates open postings
 * straight from company ATS boards (Greenhouse, Lever, Ashby, Workday, etc.),
 * which widens the discovery feed without us maintaining more scrapers.
 *
 * This is a DISCOVERY source only. The "be first" watchlist deliberately polls
 * each company's ATS directly (see watchers/companyWatcher.js) because any
 * aggregator adds crawl latency — so we never route the watchlist through here.
 *
 * Off by default. Set FANTASTIC_API_KEY (a RapidAPI key subscribed to
 * "Active Jobs DB") to enable. Runs on its own 12-hour schedule.
 *
 *   https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/active-jobs-db
 */

import { makeJobId, isSeniorRole, classifyCategory, isUSCompatible, sleep } from '../utils/helpers.js';

const RAPIDAPI_HOST = 'active-jobs-db.p.rapidapi.com';

// Title filters for tech roles — not limited to new grads.
const TITLE_FILTERS = [
    '"software engineer" | "software developer"',
    '"machine learning" | "data engineer" | "ai engineer"',
    '"data scientist" | "data analyst"',
    '"frontend engineer" | "backend engineer" | "full stack"',
    '"devops engineer" | "site reliability engineer" | "mlops"',
];

function deriveLocation(item) {
    if (Array.isArray(item.locations_derived) && item.locations_derived.length) {
        return item.locations_derived[0];
    }
    const parts = [
        Array.isArray(item.cities_derived) ? item.cities_derived[0] : item.cities_derived,
        Array.isArray(item.regions_derived) ? item.regions_derived[0] : item.regions_derived,
        Array.isArray(item.countries_derived) ? item.countries_derived[0] : item.countries_derived,
    ].filter(Boolean);
    if (parts.length) return parts.join(', ');
    if (item.remote_derived || item.location_type === 'TELECOMMUTE') return 'Remote';
    return 'US';
}

async function searchActiveJobs(apiKey, titleFilter) {
    const url = new URL(`https://${RAPIDAPI_HOST}/active-ats-7d`);
    url.searchParams.set('title_filter', titleFilter);
    url.searchParams.set('location_filter', 'United States');
    url.searchParams.set('description_type', 'text');
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', '0');

    const resp = await fetch(url.toString(), {
        headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
        signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Fantastic.jobs HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    // The API returns a bare array; be defensive about wrapper shapes too.
    if (Array.isArray(data)) return data;
    return data.jobs || data.data || [];
}

export async function scrapeFantasticJobs(filterSenior = true) {
    const apiKey = process.env.FANTASTIC_API_KEY;
    if (!apiKey || apiKey === 'your_fantastic_key_here') {
        console.warn('⚠️  Fantastic.jobs: FANTASTIC_API_KEY not set — skipping');
        return [];
    }

    const jobs = [];
    const seen = new Set();

    for (const titleFilter of TITLE_FILTERS) {
        try {
            const results = await searchActiveJobs(apiKey, titleFilter);

            for (const item of results) {
                const applyUrl = item.url || item.apply_url;
                if (!applyUrl) continue;
                if (seen.has(applyUrl)) continue;
                seen.add(applyUrl);

                const title = item.title || '';
                if (!title) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const location = deriveLocation(item);
                if (!isUSCompatible(location)) continue;

                const category = classifyCategory(title, (item.description_text || item.description || '').slice(0, 500));
                if (!category) continue;

                const postedAt = item.date_posted
                    ? new Date(item.date_posted).toISOString()
                    : new Date().toISOString();

                jobs.push({
                    id: makeJobId(applyUrl),
                    title,
                    company: item.organization || item.company || 'Unknown',
                    location,
                    url: applyUrl,
                    source: 'fantasticjobs',
                    category,
                    salary: null,
                    description: (item.description_text || item.description)
                        ? (item.description_text || item.description).slice(0, 500)
                        : null,
                    posted_at: postedAt,
                });
            }

            console.log(`✅ Fantastic.jobs ["${titleFilter}"]: ${results.length} results, ${jobs.length} kept so far`);
            await sleep(500);
        } catch (err) {
            console.error(`❌ Fantastic.jobs ["${titleFilter}"]: ${err.message}`);
        }
    }

    return jobs;
}
