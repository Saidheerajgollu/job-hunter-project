/**
 * Platform Discovery Scraper — powered by context.dev web search
 *
 * Uses context.dev web search with per-ATS domain filters to find job postings
 * across ALL companies on each platform in one query — no slug list needed.
 *
 * Why this works: Google has crawled and indexed every public job page on
 * Greenhouse, Lever, Ashby, and Workday. One search with includeDomains
 * returns job-specific URLs from dozens of different companies simultaneously,
 * including companies not in any hardcoded list.
 *
 * Verified via research: `site:boards.greenhouse.io "new grad"` returns results
 * from Databricks, Scale AI, Samsara, Okta, Benchling etc. in a single query.
 *
 * Cost: 1 credit per result × ~40 results per run = ~40 credits/run.
 * Schedule: daily (runs with the main scraper or standalone via scheduler).
 *
 * Requires: CONTEXT_DEV_API_KEY
 */

import { webSearch, isEnabled } from '../utils/context.js';
import { makeJobId, classifyCategory, isSeniorRole, sleep } from '../utils/helpers.js';

// Per-platform search configuration
const PLATFORM_SEARCHES = [
    {
        platform: 'greenhouse',
        source: 'greenhouse',
        domains: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
        queries: [
            'software engineer',
            'machine learning engineer OR data engineer',
            'data scientist OR data analyst',
            'frontend engineer OR backend engineer',
            'devops engineer OR site reliability engineer',
        ],
    },
    {
        platform: 'lever',
        source: 'lever',
        domains: ['jobs.lever.co'],
        queries: [
            'software engineer',
            'machine learning engineer OR ML engineer',
            'data engineer OR data scientist',
            'AI engineer OR frontend engineer',
        ],
    },
    {
        platform: 'ashby',
        source: 'ashby',
        domains: ['jobs.ashbyhq.com'],
        queries: [
            'software engineer',
            'machine learning OR data engineer',
            'AI engineer OR data scientist',
            'frontend engineer OR devops engineer',
        ],
    },
    {
        platform: 'workday',
        source: 'workday',
        domains: ['myworkdayjobs.com'],
        queries: [
            'software engineer',
            'machine learning engineer OR data engineer',
            'data scientist OR data analyst',
            'devops engineer OR AI engineer',
        ],
    },
];

// Extract company name from ATS job URL
function extractCompany(url, platform) {
    try {
        const { hostname, pathname } = new URL(url);
        const parts = pathname.split('/').filter(Boolean);

        switch (platform) {
            case 'greenhouse':
                // boards.greenhouse.io/{company}/jobs/{id}
                return parts[0] || null;
            case 'lever':
                // jobs.lever.co/{company}/{uuid}
                return parts[0] || null;
            case 'ashby':
                // jobs.ashbyhq.com/{company}/{uuid}
                return parts[0] || null;
            case 'workday':
                // {company}.wd1.myworkdayjobs.com/{site}/job/...
                return hostname.split('.')[0] || null;
            default:
                return null;
        }
    } catch {
        return null;
    }
}

// Turn a slug like 'scale-ai' or 'databricks' into 'Scale Ai' / 'Databricks'
function slugToName(slug) {
    return slug
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// Strip trailing ATS suffixes: "Software Engineer - Greenhouse Jobs", "| Lever"
function cleanTitle(raw) {
    return raw
        .replace(/\s*[-|–]\s*(Greenhouse|Lever|Ashby|Workday|Jobs|Careers|Apply).*/i, '')
        .replace(/\s*\|\s*.*$/, '')
        .trim();
}

function isAtsJobUrl(url, domains) {
    try {
        const { hostname } = new URL(url);
        return domains.some(d => hostname === d || hostname.endsWith('.' + d));
    } catch {
        return false;
    }
}

export async function scrapePlatformSearch(filterSenior = true) {
    if (!isEnabled()) {
        console.log('ℹ️  Platform discovery skipped: CONTEXT_DEV_API_KEY not configured');
        return [];
    }

    const jobs = [];
    const seenUrls = new Set();

    for (const { platform, source, domains, queries } of PLATFORM_SEARCHES) {
        for (const query of queries) {
            try {
                const { results } = await webSearch(query, {
                    includeDomains: domains,
                    freshness: 'last_month',
                });

                for (const result of results) {
                    if (!isAtsJobUrl(result.url, domains)) continue;
                    if (seenUrls.has(result.url)) continue;
                    seenUrls.add(result.url);

                    const title = cleanTitle(result.title || '');
                    if (!title || title.length < 4) continue;

                    const category = classifyCategory(title);
                    if (!category) continue;
                    if (filterSenior && isSeniorRole(title)) continue;

                    const companySlug = extractCompany(result.url, platform);
                    const company = companySlug ? slugToName(companySlug) : 'Unknown';

                    jobs.push({
                        id: makeJobId(result.url),
                        title,
                        company,
                        location: 'United States',
                        url: result.url,
                        source,
                        category,
                        salary: null,
                        description: result.description || null,
                        posted_at: null,
                    });
                }

                await sleep(400);
            } catch (err) {
                console.error(`❌ Platform discovery [${platform} | "${query.slice(0, 40)}"]: ${err.message}`);
            }
        }

        await sleep(300);
    }

    console.log(`📦 Platform discovery: ${jobs.length} jobs found across Greenhouse/Lever/Ashby/Workday`);
    return jobs;
}
