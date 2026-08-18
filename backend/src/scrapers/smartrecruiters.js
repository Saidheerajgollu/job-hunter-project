/**
 * SmartRecruiters Job Board Scraper
 * SmartRecruiters exposes a public JSON API for each company's postings.
 * No browser needed — pure HTTP fetch via the shared fetcher in atsFetchers.js
 * (also used by the company watchlist).
 * API: https://api.smartrecruiters.com/v1/companies/{slug}/postings
 */

import { isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';
import { fetchSmartRecruiters as fetchPostings } from '../watchers/atsFetchers.js';

const SMARTRECRUITERS_COMPANIES = [
    { slug: 'Visa', name: 'Visa' },
    { slug: 'Bosch', name: 'Bosch' },
    { slug: 'McDonalds', name: "McDonald's" },
    { slug: 'Ikea', name: 'IKEA' },
    { slug: 'Skechers', name: 'Skechers' },
];

// SmartRecruiters slugs are case-sensitive on their API, so a discovered slug
// that differs only in case from a seed company (e.g. "visa" vs "Visa") is
// still the same company — dedup case-insensitively, keeping the first-seen
// casing (seed companies take priority) so it isn't queried twice.
function mergeCompanies(seedList, extraSlugs) {
    const byKey = new Map(seedList.map(c => [c.slug.toLowerCase(), c]));
    for (const slug of extraSlugs) {
        const key = slug.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { slug, name: slug });
    }
    return [...byKey.values()];
}

export async function scrapeSmartRecruiters(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const allCompanies = mergeCompanies(SMARTRECRUITERS_COMPANIES, extraCompanies);

    for (const company of allCompanies) {
        try {
            const postings = await fetchPostings(company.slug);

            for (const posting of postings) {
                // Title-only classification: the shared fetcher doesn't carry a
                // description field for this ATS, so ambiguous titles that Ashby's
                // richer payload would resolve via description are dropped here instead.
                const category = classifyCategory(posting.title);
                if (!category) continue;
                if (filterSenior && isSeniorRole(posting.title)) continue;

                jobs.push({
                    id: posting.id,
                    title: posting.title,
                    company: company.name,
                    location: posting.location,
                    url: posting.url,
                    source: 'smartrecruiters',
                    category,
                    salary: null,
                    description: null,
                    posted_at: posting.posted_at,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ SmartRecruiters [${company.name}]: ${jobs.length} tech roles so far (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ SmartRecruiters [${company.name}]: ${err.message}`);
            }
        }
    }

    return jobs;
}
