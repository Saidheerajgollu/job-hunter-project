/**
 * Remotive Scraper
 * Free public API — no auth required.
 * https://remotive.com/api/remote-jobs
 * Specializes in remote tech jobs. Covers software-dev, data, devops, and more.
 */

import { makeJobId, isSeniorRole, classifyCategory, isUSCompatible } from '../utils/helpers.js';

// Remotive category slugs that are relevant to us
const RELEVANT_CATEGORIES = [
    'software-dev',
    'data',
    'devops-sysadmin',
    'product',
    'all-others',
];

export async function scrapeRemotive(filterSenior = true) {
    const allJobs = [];
    const seen = new Set();

    for (const category of RELEVANT_CATEGORIES) {
        try {
            const url = `https://remotive.com/api/remote-jobs?category=${category}&limit=100`;
            const resp = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)',
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(12000),
            });

            if (!resp.ok) {
                console.warn(`⚠️  Remotive [${category}]: HTTP ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const listings = data.jobs || [];

            for (const job of listings) {
                const title = job.title || '';
                if (seen.has(job.url)) continue;
                seen.add(job.url);

                const description = job.description
                    ? job.description.replace(/<[^>]*>/g, '').slice(0, 500)
                    : '';

                const jobUrl = job.url;
                const rawLocation = job.candidate_required_location || '';
                if (!isUSCompatible(rawLocation)) continue;
                const location = rawLocation || 'Remote/US';

                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                allJobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: job.company_name || 'Unknown',
                    location,
                    url: jobUrl,
                    source: 'remotive',
                    category,
                    salary: job.salary || null,
                    description: description || null,
                    posted_at: job.publication_date
                        ? new Date(job.publication_date).toISOString()
                        : new Date().toISOString(),
                });
            }

            console.log(`✅ Remotive [${category}]: ${listings.length} jobs scanned`);
        } catch (err) {
            console.error(`❌ Remotive [${category}]: ${err.message}`);
        }
    }

    console.log(`✅ Remotive total: ${allJobs.length} tech jobs found`);
    return allJobs;
}
