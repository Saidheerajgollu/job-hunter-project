/**
 * SimplifyJobs Scraper
 * Fetches the community-maintained new grad positions JSON from the
 * SimplifyJobs GitHub repo. Updated daily by hundreds of contributors.
 * No API key needed — completely free.
 *
 * Data: https://github.com/SimplifyJobs/New-Grad-Positions
 */

import { makeJobId, isSeniorRole } from '../utils/helpers.js';

const LISTINGS_URL =
    'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json';

// SimplifyJobs categories → our categories
const CATEGORY_MAP = {
    'Software': 'swe',
    'Data': 'data',
    'Quant': 'data',
    'ML': 'ai',
    'AI': 'ai',
    'Security': 'swe',
    'Hardware': 'swe',
    'Embedded': 'swe',
    'DevOps': 'swe',
    'Cloud': 'swe',
    'Firmware': 'swe',
    'Mobile': 'swe',
};

function classifyCategory(simplifyCategory, title) {
    // First try the SimplifyJobs category field
    if (simplifyCategory && CATEGORY_MAP[simplifyCategory]) {
        return CATEGORY_MAP[simplifyCategory];
    }
    // Fall back to title-based classification
    const lower = title.toLowerCase();
    if (lower.includes('machine learning') || lower.includes(' ml ') ||
        lower.includes('ai ') || lower.includes('llm') || lower.includes('nlp') ||
        lower.includes('deep learning') || lower.includes('computer vision')) return 'ai';
    if (lower.includes('data scientist') || lower.includes('data engineer') ||
        lower.includes('analytics') || lower.includes('quant')) return 'data';
    return 'swe';
}

// Only keep jobs posted in the last 90 days (SimplifyJobs has historical data too)
const NINETY_DAYS_AGO = Date.now() - 90 * 24 * 60 * 60 * 1000;

export async function scrapeSimplifyJobs(filterSenior = true) {
    console.log('🔍 SimplifyJobs: fetching community new-grad listings...');

    const jobs = [];

    try {
        const resp = await fetch(LISTINGS_URL, {
            headers: {
                'User-Agent': 'JobHunterPro/1.0 (github.com/Saidheerajgollu/job-hunter-project)',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(30000),
        });

        if (!resp.ok) {
            console.error(`❌ SimplifyJobs: HTTP ${resp.status}`);
            return [];
        }

        const listings = await resp.json();
        console.log(`✅ SimplifyJobs: ${listings.length} total listings in repo`);

        for (const listing of listings) {
            // Only active, visible listings
            if (!listing.active || listing.is_visible === false) continue;
            // Only recent listings
            if (listing.date_posted && listing.date_posted * 1000 < NINETY_DAYS_AGO) continue;
            // Filter seniors if enabled
            if (filterSenior && isSeniorRole(listing.title || '')) continue;
            // Must have a URL
            if (!listing.url) continue;

            const location = Array.isArray(listing.locations) && listing.locations.length > 0
                ? listing.locations.join(' | ')
                : 'US';

            const postedAt = listing.date_posted
                ? new Date(listing.date_posted * 1000).toISOString()
                : new Date().toISOString();

            jobs.push({
                id: makeJobId(`simplify-${listing.id || listing.url}`),
                title: listing.title || '',
                company: listing.company_name || '',
                location,
                url: listing.url,
                source: 'simplifyjobs',
                category: classifyCategory(listing.category, listing.title || ''),
                salary: null,
                description: null,
                posted_at: postedAt,
            });
        }

        console.log(`✅ SimplifyJobs: ${jobs.length} active new-grad jobs found`);
    } catch (err) {
        console.error(`❌ SimplifyJobs error: ${err.message}`);
    }

    return jobs;
}
