/**
 * RemoteOK Scraper
 * Free public API — no auth required.
 * https://remoteok.com/api
 * Returns an array of job objects (first element is metadata, skip it).
 */

import { makeJobId, isSeniorRole, classifyCategory } from '../utils/helpers.js';

const TECH_TAGS = [
    'engineer', 'developer', 'software', 'data', 'machine learning', 'ai',
    'backend', 'frontend', 'fullstack', 'full stack', 'python', 'javascript',
    'typescript', 'react', 'node', 'golang', 'rust', 'java', 'ml', 'nlp',
    'devops', 'cloud', 'platform', 'infrastructure', 'analytics', 'scientist',
];

function isTechRole(title = '', tags = []) {
    const text = (title + ' ' + tags.join(' ')).toLowerCase();
    return TECH_TAGS.some(t => text.includes(t));
}

function parseSalary(job) {
    if (job.salary_min && job.salary_max) {
        return `$${(job.salary_min / 1000).toFixed(0)}k–$${(job.salary_max / 1000).toFixed(0)}k`;
    }
    if (job.salary_min) return `$${(job.salary_min / 1000).toFixed(0)}k+`;
    return null;
}

export async function scrapeRemoteOK(filterSenior = true) {
    const jobs = [];

    try {
        const resp = await fetch('https://remoteok.com/api', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!resp.ok) {
            console.warn(`⚠️  RemoteOK: HTTP ${resp.status}`);
            return jobs;
        }

        const data = await resp.json();
        // First element is metadata object, skip it
        const listings = Array.isArray(data) ? data.slice(1) : [];

        for (const job of listings) {
            const title = job.position || '';
            const tags = job.tags || [];

            if (!isTechRole(title, tags)) continue;
            if (filterSenior && isSeniorRole(title)) continue;

            const jobUrl = job.url || `https://remoteok.com/remote-jobs/${job.id}`;
            const description = job.description
                ? job.description.replace(/<[^>]*>/g, '').slice(0, 500)
                : null;

            const category = classifyCategory(title, description || '');
            if (!category) continue;

            jobs.push({
                id: makeJobId(jobUrl),
                title,
                company: job.company || 'Unknown',
                location: 'Remote',
                url: jobUrl,
                source: 'remoteok',
                category,
                salary: parseSalary(job),
                description,
                posted_at: job.date ? new Date(job.date).toISOString() : new Date().toISOString(),
            });
        }

        console.log(`✅ RemoteOK: ${jobs.length} tech jobs found`);
    } catch (err) {
        console.error(`❌ RemoteOK: ${err.message}`);
    }

    return jobs;
}
