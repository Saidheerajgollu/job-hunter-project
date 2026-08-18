/**
 * Workable Job Board Scraper
 * Workable exposes a public careers-widget JSON API for each company.
 * No browser needed — pure HTTP fetch via the shared fetcher in atsFetchers.js
 * (also used by the company watchlist).
 * API: https://www.workable.com/api/accounts/{slug}?details=true
 */

import { isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';
import { fetchWorkable as fetchPostings } from '../watchers/atsFetchers.js';

const WORKABLE_COMPANIES = [
    { slug: 'salesloft', name: 'Salesloft' },
    { slug: 'sword-health', name: 'Sword Health' },
    { slug: 'level', name: 'Level' },
    { slug: 'quench', name: 'Quench' },
    { slug: 'catalyst', name: 'Catalyst' },
];

// Workable slugs are case-sensitive on their API, so a discovered slug that
// differs only in case from a seed company (e.g. "Salesloft" vs "salesloft")
// is still the same company — dedup case-insensitively, keeping the
// first-seen casing (seed companies take priority) so it isn't queried twice.
function mergeCompanies(seedList, extraSlugs) {
    const byKey = new Map(seedList.map(c => [c.slug.toLowerCase(), c]));
    for (const slug of extraSlugs) {
        const key = slug.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { slug, name: slug });
    }
    return [...byKey.values()];
}

export async function scrapeWorkable(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const seenUrls = [];
    const allCompanies = mergeCompanies(WORKABLE_COMPANIES, extraCompanies);

    for (const company of allCompanies) {
        try {
            const postings = await fetchPostings(company.slug);
            polledCompanies.push(company.name);

            for (const posting of postings) {
                seenUrls.push(posting.url);

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
                    source: 'workable',
                    category,
                    salary: null,
                    description: null,
                    posted_at: posting.posted_at,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Workable [${company.name}]: ${jobs.length} tech roles so far (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ Workable [${company.name}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies, seenUrls };
}
