/**
 * Lever Job Board Scraper
 * Lever exposes a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory, mapWithConcurrency } from '../utils/helpers.js';

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

const CONCURRENCY = 8; // boards fetched in parallel

export async function scrapeLever(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const seenUrls = [];
    const allCompanies = [...new Set([...LEVER_COMPANIES, ...extraCompanies])];

    await mapWithConcurrency(allCompanies, CONCURRENCY, async (company) => {
        try {
            // No server-side commitment filter: it's an exact match against values
            // like "Full-time", so the old `commitment=fulltime` returned nothing
            // for every board. Internships are skipped client-side below instead.
            const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(20000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️ Lever ${company}: HTTP ${resp.status}`);
                return;
            }

            const postings = await resp.json();
            if (!Array.isArray(postings)) return;

            const companyName = company.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            polledCompanies.push(companyName);

            let companyCount = 0;
            for (const posting of postings) {
                const jobUrl = posting.hostedUrl || `https://jobs.lever.co/${company}/${posting.id}`;
                seenUrls.push(jobUrl);

                if (/intern/i.test(posting.categories?.commitment || '')) continue;

                const title = posting.text || '';
                const description = posting.descriptionPlain?.slice(0, 500) || '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const location = posting.categories?.location || posting.workplaceType || 'Remote/US';
                const postedAt = posting.createdAt
                    ? new Date(posting.createdAt).toISOString()
                    : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: companyName,
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
            await sleep(100);
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Lever [${company}]: ${err.message}`);
            }
        }
    });

    return { jobs, polledCompanies, seenUrls };
}
