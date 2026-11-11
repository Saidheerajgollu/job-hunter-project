/**
 * SimplifyJobs Scraper
 * Fetches the community-maintained new grad positions JSON from the
 * SimplifyJobs GitHub repo. Updated daily by hundreds of contributors.
 * No API key needed — completely free.
 *
 * Data: https://github.com/SimplifyJobs/New-Grad-Positions
 */

import { makeJobId, isSeniorRole, classifyCategory } from '../utils/helpers.js';
import { domainFromUrl } from '../utils/companyDomain.js';

const LISTINGS_URLS = [
    'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json',
    'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
];

/**
 * Simplify's sponsorship flag as a sentence the shared wording checks read:
 * citizen-only roles are dropped, the other two become the visa badge.
 */
export function sponsorshipText(flag) {
    if (flag === 'U.S. Citizenship is Required') return 'U.S. Citizenship is Required';
    if (flag === 'Does Not Offer Sponsorship') return 'Does not offer visa sponsorship';
    if (flag === 'Offers Sponsorship') return 'Visa sponsorship is offered';
    return null;
}

// SimplifyJobs category field → hint passed to shared classifyCategory
const SIMPLIFY_CATEGORY_HINT = {
    'Software': 'software engineer',
    'Data': 'data engineer',
    'Quant': 'data analyst quant',
    'ML': 'machine learning engineer',
    'AI': 'ai engineer llm',
    'Security': 'security engineer',
    'Hardware': 'hardware engineer',
    'Embedded': 'embedded firmware engineer',
    'DevOps': 'devops cloud engineer',
    'Cloud': 'cloud devops engineer',
    'Firmware': 'firmware embedded engineer',
    'Mobile': 'mobile ios android developer',
};


// Only keep jobs posted in the last 90 days (SimplifyJobs has historical data too)
const NINETY_DAYS_AGO = Date.now() - 90 * 24 * 60 * 60 * 1000;

export async function scrapeSimplifyJobs(filterSenior = true) {
    console.log('🔍 SimplifyJobs: fetching community new-grad listings...');

    const jobs = [];
    const seenUrls = new Set();

    for (const listingsUrl of LISTINGS_URLS) try {
        const resp = await fetch(listingsUrl, {
            headers: {
                'User-Agent': 'JobHunterPro/1.0 (github.com/Saidheerajgollu/job-hunter-project)',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(60000),
        });

        if (!resp.ok) {
            console.error(`❌ SimplifyJobs: HTTP ${resp.status} for ${listingsUrl}`);
            continue;
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
            if (!listing.url || seenUrls.has(listing.url)) continue;

            const category = classifyCategory(listing.title || '', SIMPLIFY_CATEGORY_HINT[listing.category] || '');
            if (!category) continue;

            const location = Array.isArray(listing.locations) && listing.locations.length > 0
                ? listing.locations.join(' | ')
                : 'US';

            const postedAt = listing.date_posted
                ? new Date(listing.date_posted * 1000).toISOString()
                : new Date().toISOString();

            seenUrls.add(listing.url);
            jobs.push({
                id: makeJobId(`simplify-${listing.id || listing.url}`),
                title: listing.title || '',
                company: listing.company_name || '',
                location,
                url: listing.url,
                source: 'simplifyjobs',
                company_domain: listing.company_url ? domainFromUrl(listing.company_url) : null,
                category,
                salary: null,
                description: sponsorshipText(listing.sponsorship),
                posted_at: postedAt,
            });
        }

    } catch (err) {
        console.error(`❌ SimplifyJobs error: ${err.message}`);
    }

    console.log(`✅ SimplifyJobs: ${jobs.length} active tech jobs found`);
    return jobs;
}
