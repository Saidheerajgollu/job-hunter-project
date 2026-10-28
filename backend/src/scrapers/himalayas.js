/**
 * Himalayas Scraper
 * Free public API — no key required.
 * Remote-first job board with seniority filtering built in.
 *
 * Uses the search endpoint (https://himalayas.app/jobs/api/search) filtered to
 * US-eligible roles and sorted newest-first. The browse feed (/jobs/api) caps
 * every response at 20 jobs across all professions, so it surfaced ~10 tech
 * roles per run.
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory, toIsoDate } from '../utils/helpers.js';

const SEARCH_URL = 'https://himalayas.app/jobs/api/search';

const SEARCH_TERMS = [
    'software engineer',
    'frontend engineer',
    'backend engineer',
    'full stack',
    'data engineer',
    'data scientist',
    'data analyst',
    'machine learning',
    'ai engineer',
    'devops',
];
const PAGES_PER_TERM = 3; // 20 per page → up to 60 newest per term

function toList(value) {
    if (Array.isArray(value)) return value;
    return value ? [String(value)] : [];
}

async function fetchSearchPage(term, page) {
    const params = new URLSearchParams({ q: term, country: 'US', sort: 'recent', page: String(page) });
    const resp = await fetch(`${SEARCH_URL}?${params}`, {
        headers: { 'User-Agent': 'JobHunterPro/1.0' },
        signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.jobs || [];
}

export async function scrapeHimalayas(filterSenior = true) {
    const jobs = [];
    const seen = new Set();
    let scanned = 0;

    for (const term of SEARCH_TERMS) {
        try {
            for (let page = 1; page <= PAGES_PER_TERM; page++) {
                const listings = await fetchSearchPage(term, page);
                scanned += listings.length;

                for (const job of listings) {
                    const url = job.applicationLink || job.guid;
                    if (!url || seen.has(url)) continue;
                    seen.add(url);

                    const title = job.title || '';
                    const seniority = toList(job.seniority).join(' ').toLowerCase();

                    // Skip Director / VP / C-level — keep Entry-level and Mid-level
                    // (isSeniorRole also catches Senior/Staff/Lead/Manager/Director by title)
                    if (seniority.includes('director') || seniority.includes('vp') || seniority.includes('executive')) continue;
                    if (filterSenior && isSeniorRole(title)) continue;

                    const category = classifyCategory(title, (job.excerpt || job.description || '').slice(0, 300));
                    if (!category) continue;

                    const restrictions = toList(job.locationRestrictions);
                    const location = restrictions.length ? restrictions.join(', ') : 'Remote';

                    const salary = job.minSalary && job.maxSalary && (!job.salaryPeriod || job.salaryPeriod === 'annual')
                        ? `$${Math.round(job.minSalary / 1000)}k–$${Math.round(job.maxSalary / 1000)}k`
                        : null;

                    jobs.push({
                        id: makeJobId(url),
                        title,
                        company: job.companyName || 'Unknown',
                        location,
                        url,
                        source: 'himalayas',
                        category,
                        salary,
                        description: job.excerpt ? job.excerpt.slice(0, 500) : null,
                        // pubDate is unix SECONDS — toIsoDate handles that.
                        posted_at: toIsoDate(job.pubDate),
                    });
                }

                if (listings.length < 20) break;
                await sleep(300);
            }
        } catch (err) {
            console.error(`❌ Himalayas [${term}]: ${err.message}`);
        }
    }

    console.log(`✅ Himalayas: ${scanned} scanned, ${jobs.length} tech jobs`);
    return jobs;
}
