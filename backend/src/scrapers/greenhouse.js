/**
 * Greenhouse Job Board Scraper
 * Greenhouse offers a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 */

import { makeJobId, isSeniorRole, sleep } from '../utils/helpers.js';

// Companies known to use Greenhouse job boards (expand this list!)
const GREENHOUSE_COMPANIES = [
    // AI / ML
    'openai', 'anthropic', 'cohere', 'scale', 'huggingface', 'stability',
    'adept', 'inflection', 'perplexity', 'mistral', 'together',
    // Big Tech
    'stripe', 'figma', 'notion', 'airtable', 'dropbox', 'asana', 'zendesk',
    // Data / Cloud
    'databricks', 'snowflake', 'dbt', 'fivetran', 'airbyte',
    // SWE
    'airbnb', 'lyft', 'doordash', 'robinhood', 'brex', 'plaid', 'gusto',
];

const NEW_GRAD_KEYWORDS = [
    'new grad', 'new graduate', 'entry level', 'entry-level',
    'junior', '0-2', '2025', '2026', 'university grad', 'university hire',
    'university recruiting', 'campus',
];

function isNewGradRole(title, metadata = '') {
    const text = (title + ' ' + metadata).toLowerCase();
    return NEW_GRAD_KEYWORDS.some(kw => text.includes(kw));
}

function classifyCategory(title) {
    const lower = title.toLowerCase();
    if (lower.includes('machine learning') || lower.includes('ml ') || lower.includes('ai ') || lower.includes('artificial intelligence')) return 'ai';
    if (lower.includes('data scientist') || lower.includes('data engineer') || lower.includes('data analyst') || lower.includes('analytics')) return 'data';
    return 'swe';
}

export async function scrapeGreenhouse(filterSenior = true) {
    const jobs = [];

    for (const company of GREENHOUSE_COMPANIES) {
        try {
            const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️  Greenhouse ${company}: HTTP ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const allJobs = data.jobs || [];

            for (const job of allJobs) {
                const title = job.title || '';
                if (!isNewGradRole(title, job.departments?.map(d => d.name).join(' ') || '')) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = job.absolute_url || `https://boards.greenhouse.io/${company}/jobs/${job.id}`;
                const location = job.location?.name || 'Remote/Unknown';
                const postedAt = job.updated_at ? new Date(job.updated_at).toISOString() : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: company.charAt(0).toUpperCase() + company.slice(1),
                    location,
                    url: jobUrl,
                    source: 'greenhouse',
                    category: classifyCategory(title),
                    salary: null,
                    description: job.content ? job.content.replace(/<[^>]*>/g, '').slice(0, 500) : null,
                    posted_at: postedAt,
                });
            }

            console.log(`✅ Greenhouse [${company}]: ${jobs.length} new grad jobs found`);
            await sleep(300); // Be polite to the API
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Greenhouse [${company}]: ${err.message}`);
            }
        }
    }

    return jobs;
}
