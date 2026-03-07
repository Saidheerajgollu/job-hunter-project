/**
 * Lever Job Board Scraper
 * Lever exposes a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 */

import { makeJobId, isSeniorRole, sleep } from '../utils/helpers.js';

const LEVER_COMPANIES = [
    // AI / ML
    'openai', 'anthropic', 'scale-ai', 'cohere', 'x-ai',
    'character', 'deepmind', 'waymo', 'cruise',
    // Big Tech adjacent
    'netflix', 'reddit', 'discord', 'ramp', 'benchling', 'rippling',
    'vercel', 'retool', 'linear', 'amplitude', 'segment',
    // SWE
    'coinbase', 'duolingo', 'canva', 'figma', 'notion', 'coda',
    'lattice', 'carta', 'chime', 'affirm',
];

const NEW_GRAD_KEYWORDS = [
    'new grad', 'new graduate', 'entry level', 'entry-level',
    'junior', '2025', '2026', 'university grad', 'campus hire',
    'associate', 'early career',
];

function isNewGrad(title, tags = []) {
    const text = (title + ' ' + tags.join(' ')).toLowerCase();
    return NEW_GRAD_KEYWORDS.some(kw => text.includes(kw));
}

function classifyCategory(title) {
    const lower = title.toLowerCase();
    if (lower.includes('machine learning') || lower.includes(' ml ') || lower.includes('ai ') ||
        lower.includes('artificial intelligence') || lower.includes('nlp') || lower.includes('llm')) return 'ai';
    if (lower.includes('data scientist') || lower.includes('data engineer') || lower.includes('analytics')) return 'data';
    return 'swe';
}

export async function scrapeLever(filterSenior = true) {
    const jobs = [];

    for (const company of LEVER_COMPANIES) {
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

            for (const posting of postings) {
                const title = posting.text || '';
                const tags = posting.tags || [];
                if (!isNewGrad(title, tags)) continue;
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
                    category: classifyCategory(title),
                    salary: null,
                    description: posting.descriptionPlain?.slice(0, 500) || null,
                    posted_at: postedAt,
                });
            }

            if (postings.length) console.log(`✅ Lever [${company}]: checked ${postings.length} postings`);
            await sleep(300);
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Lever [${company}]: ${err.message}`);
            }
        }
    }

    return jobs;
}
