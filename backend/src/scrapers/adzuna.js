/**
 * Adzuna Job Search API Scraper
 * Free tier: 1,000 API calls/month — more than enough at 6 scrapes/day.
 * Covers millions of jobs from thousands of sources in US, UK, CA, AU and more.
 *
 * Sign up (free): https://developer.adzuna.com/
 * Set env vars: ADZUNA_APP_ID and ADZUNA_APP_KEY
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs';

// Search queries per category — tuned for new grads
const QUERIES = {
    ai: [
        'new grad machine learning engineer',
        'entry level AI engineer 2026',
        'junior NLP engineer new graduate',
    ],
    swe: [
        'new grad software engineer 2026',
        'entry level software engineer new graduate',
        'junior developer new grad 2026',
    ],
    data: [
        'new grad data scientist 2026',
        'entry level data engineer new graduate',
        'junior analytics engineer new grad',
    ],
};

// Countries to search — add more as needed
const COUNTRIES = ['us'];  // 'gb', 'ca', 'au' also available on free tier

async function searchAdzuna(appId, appKey, country, query, category) {
    const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: '50',
        what: query,
        max_days_old: '3',       // Only jobs from last 3 days (very fresh)
        sort_by: 'date',         // Newest first
        content_type: 'json',
    });

    const url = `${ADZUNA_BASE}/${country}/search/1?${params}`;

    const resp = await fetch(url, {
        headers: { 'User-Agent': 'JobHunterPro/1.0' },
        signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    return data.results || [];
}

export async function scrapeAdzuna(filterSenior = true) {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;

    if (!appId || !appKey) {
        console.log('⚠️  Adzuna: ADZUNA_APP_ID / ADZUNA_APP_KEY not set — skipping.');
        console.log('   Sign up free at https://developer.adzuna.com/ to enable this scraper.');
        return [];
    }

    const jobs = [];
    console.log('🔍 Adzuna: searching across all categories...');

    for (const country of COUNTRIES) {
        for (const [category, queries] of Object.entries(QUERIES)) {
            // Use 1 query per category to stay within free tier limits
            const query = queries[0];
            try {
                const results = await searchAdzuna(appId, appKey, country, query, category);

                for (const result of results) {
                    const title = result.title || '';
                    if (filterSenior && isSeniorRole(title)) continue;

                    const jobUrl = result.redirect_url || result.adref || '';
                    if (!jobUrl) continue;

                    const description = result.description?.slice(0, 500) || null;
                    const resolvedCategory = classifyCategory(title, description || '');
                    if (!resolvedCategory) continue; // skip non-tech roles

                    jobs.push({
                        id: makeJobId(`adzuna-${result.id || jobUrl}`),
                        title,
                        company: result.company?.display_name || 'Unknown',
                        location: result.location?.display_name || 'US',
                        url: jobUrl,
                        source: 'adzuna',
                        category: resolvedCategory,
                        salary: result.salary_min
                            ? `$${Math.round(result.salary_min / 1000)}k–$${Math.round(result.salary_max / 1000)}k`
                            : null,
                        description,
                        posted_at: result.created
                            ? new Date(result.created).toISOString()
                            : new Date().toISOString(),
                    });
                }

                console.log(`✅ Adzuna [${country}/${category}]: ${results.length} results`);
                await sleep(500); // Rate-limiting courtesy
            } catch (err) {
                console.error(`❌ Adzuna [${country}/${category}]: ${err.message}`);
            }
        }
    }

    console.log(`✅ Adzuna total: ${jobs.length} fresh jobs`);
    return jobs;
}
