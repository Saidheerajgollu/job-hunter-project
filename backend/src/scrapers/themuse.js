/**
 * The Muse API Scraper — free, no required key
 *
 * The Muse curates tech and startup jobs with good new-grad signal.
 * Their public API returns structured JSON with categories, levels, and
 * company info. No key needed for 500 req/hr; optional key for 3,600/hr.
 *
 * Docs: https://www.themuse.com/developers/api/v2
 * Env:  MUSE_API_KEY (optional — increases rate limit)
 */

import { makeJobId, isSeniorRole, classifyCategory, sleep } from '../utils/helpers.js';

const BASE = 'https://www.themuse.com/api/public/jobs';

// Categories that map to tech roles on The Muse
const TECH_CATEGORIES = [
    'Software Engineer',
    'Data Science',
    'Data Analysis',
    'Machine Learning',
    'DevOps',
    'IT',
    'QA',
    'Product',
];

async function fetchMusePage(category, page) {
    const params = new URLSearchParams({
        category,
        page: String(page),
        ...(process.env.MUSE_API_KEY ? { api_key: process.env.MUSE_API_KEY } : {}),
    });

    const resp = await fetch(`${BASE}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
        signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) {
        if (resp.status === 429) throw new Error('Rate limited');
        return { results: [], total: 0 };
    }

    return resp.json();
}

export async function scrapeTheMuse(filterSenior = true) {
    const jobs = [];
    const seenIds = new Set();

    for (const category of TECH_CATEGORIES) {
        try {
            for (let page = 0; page < 3; page++) {
                const data = await fetchMusePage(category, page);
                const results = data.results || [];
                if (results.length === 0) break;

                for (const job of results) {
                        const url = job.refs?.landing_page;
                        if (!url || seenIds.has(url)) continue;
                        seenIds.add(url);

                        const title = job.name || '';
                        if (filterSenior && isSeniorRole(title)) continue;

                        const company = job.company?.name || 'Unknown';
                        const location = job.locations?.map(l => l.name).join(', ') || 'Remote';
                        const category_ = classifyCategory(title);
                        if (!category_) continue;

                        const postedAt = job.publication_date
                            ? new Date(job.publication_date).toISOString()
                            : new Date().toISOString();

                        jobs.push({
                            id: makeJobId(url),
                            title,
                            company,
                            location,
                            url,
                            source: 'themuse',
                            category: category_,
                            salary: null,
                            description: job.contents
                                ? job.contents.replace(/<[^>]*>/g, '').slice(0, 500)
                                : null,
                            posted_at: postedAt,
                        });
                    }

                await sleep(300);
            }
        } catch (err) {
            if (err.message === 'Rate limited') {
                console.warn('⚠️  The Muse: rate limited — stopping early. Set MUSE_API_KEY for higher limits.');
                return jobs;
            }
            console.error(`❌ The Muse [${category}]: ${err.message}`);
        }
    }

    console.log(`📦 The Muse: ${jobs.length} tech jobs`);
    return jobs;
}
