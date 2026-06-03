/**
 * Handshake + Simplify + Direct Company Career Pages Scraper
 * Targets graduate-focused boards and direct company career pages.
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

// Direct company career pages with structured JSON feeds
const DIRECT_CAREER_FEEDS = [
    // Companies with public JSON job feeds
    {
        company: 'Cloudflare',
        url: 'https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs',
        type: 'greenhouse',
    },
    {
        company: 'Datadog',
        url: 'https://boards-api.greenhouse.io/v1/boards/datadog/jobs',
        type: 'greenhouse',
    },
    {
        company: 'MongoDB',
        url: 'https://boards-api.greenhouse.io/v1/boards/mongodb/jobs',
        type: 'greenhouse',
    },
    {
        company: 'Twilio',
        url: 'https://boards-api.greenhouse.io/v1/boards/twilio/jobs',
        type: 'greenhouse',
    },
    {
        company: 'HashiCorp',
        url: 'https://boards-api.greenhouse.io/v1/boards/hashicorp/jobs',
        type: 'greenhouse',
    },
    {
        company: 'Palantir',
        url: 'https://boards-api.greenhouse.io/v1/boards/palantir/jobs',
        type: 'greenhouse',
    },
    {
        company: 'SpaceX',
        url: 'https://boards-api.greenhouse.io/v1/boards/spacex/jobs',
        type: 'greenhouse',
    },
    {
        company: 'Tesla',
        url: 'https://www.tesla.com/cua-api/tesla-jobs/search?query=new+grad&country=US&language=en',
        type: 'tesla',
    },
    {
        company: 'Apple (direct)',
        url: 'https://jobs.apple.com/api/role/search?page=1&locale=en-us&query=new+grad+software+engineer',
        type: 'apple',
    },
];

const NEW_GRAD_KEYWORDS = [
    'new grad', 'new graduate', 'entry level', 'entry-level',
    'junior', '2025', '2026', 'university', 'campus', 'associate', 'early career',
];

function isNewGrad(title) {
    const lower = title.toLowerCase();
    return NEW_GRAD_KEYWORDS.some(kw => lower.includes(kw));
}

async function fetchGreenhouseFeed(feed, filterSenior) {
    const jobs = [];
    const resp = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
        signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return jobs;

    const data = await resp.json();
    for (const job of (data.jobs || [])) {
        if (!isNewGrad(job.title || '')) continue;
        if (filterSenior && isSeniorRole(job.title)) continue;

        const url = job.absolute_url || `https://boards.greenhouse.io/${feed.company}/jobs/${job.id}`;
        jobs.push({
            id: makeJobId(url),
            title: job.title,
            company: feed.company,
            location: job.location?.name || 'US',
            url,
            source: 'direct',
            category: classifyCategory(job.title),
            salary: null,
            description: null,
            posted_at: job.updated_at ? new Date(job.updated_at).toISOString() : new Date().toISOString(),
        });
    }
    return jobs;
}

export async function scrapeDirectCareerPages(filterSenior = true) {
    const jobs = [];

    for (const feed of DIRECT_CAREER_FEEDS) {
        try {
            let feedJobs = [];
            if (feed.type === 'greenhouse') {
                feedJobs = await fetchGreenhouseFeed(feed, filterSenior);
            }
            // Tesla and Apple direct feeds are complex; skip for now and rely on Workday/Greenhouse
            jobs.push(...feedJobs);
            if (feedJobs.length) console.log(`✅ Direct [${feed.company}]: ${feedJobs.length} new grad roles`);
            await sleep(400);
        } catch (err) {
            console.error(`❌ Direct [${feed.company}]: ${err.message}`);
        }
    }

    return jobs;
}
