/**
 * Recruitee Job Board Scraper
 * Recruitee exposes a public JSON API for each company's offers.
 * No browser needed — pure HTTP fetch via the shared fetcher in atsFetchers.js
 * (also used by the company watchlist).
 * API: https://{slug}.recruitee.com/api/offers/
 */

import { isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';
import { fetchRecruitee as fetchPostings } from '../watchers/atsFetchers.js';

const RECRUITEE_COMPANIES = [
    { slug: 'gitlab', name: 'GitLab' },
    { slug: 'tomtom', name: 'TomTom' },
    { slug: 'framer', name: 'Framer' },
    { slug: 'bynder', name: 'Bynder' },
    { slug: 'mendix', name: 'Mendix' },
];

export async function scrapeRecruitee(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const extraObjs = extraCompanies.map(slug => ({ slug, name: slug }));
    const allCompanies = [
        ...RECRUITEE_COMPANIES,
        ...extraObjs.filter(e => !RECRUITEE_COMPANIES.some(c => c.slug === e.slug)),
    ];

    for (const company of allCompanies) {
        try {
            const postings = await fetchPostings(company.slug);
            polledCompanies.push(company.name);

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
                    source: 'recruitee',
                    category,
                    salary: null,
                    description: null,
                    posted_at: posting.posted_at,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Recruitee [${company.name}]: ${jobs.length} tech roles so far (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ Recruitee [${company.name}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
