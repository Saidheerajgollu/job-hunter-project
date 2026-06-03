/**
 * Ashby Job Board Scraper
 * Ashby exposes a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 * API: https://boards-api.ashbyhq.com/posting-api/job-board/{slug}
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

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

const NEW_GRAD_KEYWORDS = [
    'new grad', 'new graduate', 'entry level', 'entry-level',
    'junior', '0-2', '2025', '2026', 'university', 'campus',
    'associate', 'early career',
];

function isNewGrad(title, teamName = '') {
    const text = (title + ' ' + teamName).toLowerCase();
    return NEW_GRAD_KEYWORDS.some(kw => text.includes(kw));
}

export async function scrapeAshby(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const extraObjs = extraCompanies.map(slug => ({ slug, name: slug }));
    const allCompanies = [
        ...ASHBY_COMPANIES,
        ...extraObjs.filter(e => !ASHBY_COMPANIES.some(a => a.slug === e.slug)),
    ];

    for (const company of allCompanies) {
        try {
            const url = `https://boards-api.ashbyhq.com/posting-api/job-board/${company.slug}`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️  Ashby ${company.slug}: HTTP ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const postings = data.jobPostings || [];

            for (const posting of postings) {
                if (!posting.isListed) continue;
                const title = posting.title || '';
                if (!isNewGrad(title, posting.teamName || '')) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = posting.jobUrl || `https://jobs.ashbyhq.com/${company.slug}/${posting.id}`;
                const location = posting.locationName || posting.workplaceType || 'Remote/US';
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
                    category: classifyCategory(title),
                    salary: null,
                    description: null,
                    posted_at: postedAt,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Ashby [${company.name}]: ${postings.length} postings checked`);
            }
            await sleep(250);
        } catch (err) {
            if (!err.message?.includes('404')) {
                console.error(`❌ Ashby [${company.name}]: ${err.message}`);
            }
        }
    }

    return jobs;
}
