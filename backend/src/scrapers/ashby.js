/**
 * Ashby Job Board Scraper
 * Ashby exposes a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 * API: https://api.ashbyhq.com/posting-api/job-board/{slug}
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

const ASHBY_API = 'https://api.ashbyhq.com/posting-api/job-board';

const ASHBY_COMPANIES = [
    // AI / ML / Dev Tools
    { slug: 'anyscale', name: 'Anyscale' },
    { slug: 'together', name: 'Together AI' },
    { slug: 'wandb', name: 'Weights & Biases' },
    { slug: 'modal', name: 'Modal' },
    { slug: 'cursor', name: 'Cursor' },
    { slug: 'runway', name: 'Runway ML' },
    { slug: 'midjourney', name: 'Midjourney' },
    { slug: 'mistral', name: 'Mistral AI' },
    { slug: 'replit', name: 'Replit' },
    // Infra / Data
    { slug: 'clickhouse', name: 'ClickHouse' },
    { slug: 'neon', name: 'Neon' },
    { slug: 'supabase', name: 'Supabase' },
    { slug: 'turso', name: 'Turso' },
    { slug: 'planetscale', name: 'PlanetScale' },
    // Fintech / Ops
    { slug: 'ramp', name: 'Ramp' },
    { slug: 'mercury', name: 'Mercury' },
    { slug: 'brex', name: 'Brex' },
    // SaaS / Productivity
    { slug: 'linear', name: 'Linear' },
    { slug: 'rippling', name: 'Rippling' },
    { slug: 'loom', name: 'Loom' },
    { slug: 'retool', name: 'Retool' },
    { slug: 'descript', name: 'Descript' },
    { slug: 'coda', name: 'Coda' },
    { slug: 'hex', name: 'Hex' },
    { slug: 'grammarly', name: 'Grammarly' },
    { slug: 'vanta', name: 'Vanta' },
    { slug: 'arc', name: 'Arc' },
    { slug: 'vercel', name: 'Vercel' },
];

export async function scrapeAshby(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const seenUrls = [];
    const extraObjs = extraCompanies.map(slug => ({ slug, name: slug }));
    const allCompanies = [
        ...ASHBY_COMPANIES,
        ...extraObjs.filter(e => !ASHBY_COMPANIES.some(a => a.slug === e.slug)),
    ];

    for (const company of allCompanies) {
        try {
            const url = `${ASHBY_API}/${company.slug}`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️  Ashby ${company.slug}: HTTP ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const postings = data.jobs || data.jobPostings || [];
            polledCompanies.push(company.name);
            let companyCount = 0;

            for (const posting of postings) {
                // isListed === false means the posting is no longer live on the
                // board, so it is deliberately NOT recorded in seenUrls — it
                // should be eligible for the staleness closer sweep.
                if (posting.isListed === false) continue;

                const jobUrl = posting.jobUrl || `https://jobs.ashbyhq.com/${company.slug}/${posting.id}`;
                seenUrls.push(jobUrl);

                const title = posting.title || '';
                const description = posting.descriptionPlain || posting.descriptionHtml || '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const location = posting.location || posting.locationName || posting.workplaceType || 'Remote/US';
                const postedAt = posting.publishedAt
                    ? new Date(posting.publishedAt).toISOString()
                    : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: company.name,
                    location,
                    url: jobUrl,
                    source: 'ashby',
                    category,
                    salary: posting.compensation?.scrapeableCompensationSalarySummary || null,
                    description: posting.descriptionPlain || null,
                    posted_at: postedAt,
                });
                companyCount++;
            }

            if (postings.length > 0) {
                console.log(`✅ Ashby [${company.name}]: ${companyCount} tech roles (${postings.length} total)`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ Ashby [${company.name}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies, seenUrls };
}
