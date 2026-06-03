/**
 * Himalayas Scraper
 * Free public API — no key required.
 * Remote-first job board with seniority filtering built in.
 * API: https://himalayas.app/jobs/api
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

const API_URL = 'https://himalayas.app/jobs/api';

export async function scrapeHimalayas(filterSenior = true) {
    const jobs = [];

    try {
        const resp = await fetch(`${API_URL}?limit=100`, {
            headers: { 'User-Agent': 'JobHunterPro/1.0' },
            signal: AbortSignal.timeout(15000),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        const listings = data.jobs || [];

        for (const job of listings) {
            const title = job.title || '';
            const seniority = (Array.isArray(job.seniority) ? job.seniority.join(' ') : String(job.seniority || '')).toLowerCase();

            // Skip Director / VP / C-level — keep Entry-level and Mid-level
            // (isSeniorRole also catches Senior/Staff/Lead/Manager/Director by title)
            if (seniority.includes('director') || seniority.includes('vp') || seniority.includes('executive')) continue;
            if (filterSenior && isSeniorRole(title)) continue;

            const url = job.applicationLink || job.guid;
            if (!url) continue;

            const category = classifyCategory(title, (job.excerpt || job.description || '').slice(0, 300));
            if (!category) continue;

            const location = Array.isArray(job.locationRestrictions) && job.locationRestrictions.length
                ? job.locationRestrictions.join(', ')
                : 'Remote';

            const salary = job.minSalary && job.maxSalary
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
                posted_at: job.pubDate ? new Date(job.pubDate).toISOString() : new Date().toISOString(),
            });
        }

        console.log(`✅ Himalayas: ${listings.length} total, ${jobs.length} entry-level tech jobs`);
    } catch (err) {
        console.error(`❌ Himalayas: ${err.message}`);
    }

    return jobs;
}
