/**
 * Lever Job Board Scraper
 * Lever exposes a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

const LEVER_COMPANIES = [
    // AI / ML
    'openai', 'anthropic', 'scale-ai', 'cohere', 'x-ai',
    'character', 'waymo', 'cruise', 'imbue',
    // Big Tech adjacent
    'netflix', 'reddit', 'discord', 'ramp', 'benchling', 'rippling',
    'vercel', 'retool', 'linear', 'amplitude', 'segment',
    // SWE / Fintech
    'coinbase', 'duolingo', 'canva', 'figma', 'notion', 'coda',
    'lattice', 'carta', 'chime', 'affirm',
    // Infra / DevTools
    'cloudinary', 'mux', 'livekit', 'posthog', 'sourcegraph',
    'fly', 'railway', 'render', 'appsmith', 'backstage',
    // B2B SaaS
    'hubspot', 'zendesk', 'intercom', 'calendly', 'zapier',
    'clickup', 'monday', 'airtable', 'deel', 'remote',
    // Quant / Finance
    'citadel', 'citadelsecurities', 'sig', 'drw', 'imc',
];

export async function scrapeLever(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const allCompanies = [...new Set([...LEVER_COMPANIES, ...extraCompanies])];

    for (const company of allCompanies) {
        try {
            const url = `https://api.lever.co/v0/postings/${company}?mode=json&commitment=fulltime`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️ Lever ${company}: HTTP ${resp.status}`);
                continue;
            }

            const postings = await resp.json();
            if (!Array.isArray(postings)) continue;

            let companyCount = 0;
            for (const posting of postings) {
                const title = posting.text || '';
                const description = posting.descriptionPlain?.slice(0, 500) || '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = posting.hostedUrl || `https://jobs.lever.co/${company}/${posting.id}`;
                const location = posting.categories?.location || posting.workplaceType || 'Remote/US';
                const postedAt = posting.createdAt
                    ? new Date(posting.createdAt).toISOString()
                    : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: company.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    location,
                    url: jobUrl,
                    source: 'lever',
                    category,
                    salary: null,
                    description: description || null,
                    posted_at: postedAt,
                });
                companyCount++;
            }

            if (postings.length) {
                console.log(`✅ Lever [${company}]: ${companyCount} tech roles (${postings.length} total)`);
            }
            await sleep(300);
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Lever [${company}]: ${err.message}`);
            }
        }
    }

    return jobs;
}
