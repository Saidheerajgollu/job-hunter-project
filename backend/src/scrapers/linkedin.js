/**
 * LinkedIn Job Scraper
 * Uses Playwright to scrape public job search results pages.
 * LinkedIn blocks bots aggressively, so we use realistic browser behavior.
 */

import { makeJobId, parsePostedAt, isSeniorRole, sleep } from '../utils/helpers.js';

const BASE_URL = 'https://www.linkedin.com/jobs/search';

const SEARCH_QUERIES = {
    ai: [
        'new grad AI engineer 2025 2026',
        'entry level machine learning engineer',
        'junior AI engineer new graduate',
    ],
    swe: [
        'new grad software engineer 2025 2026',
        'entry level software engineer new graduate',
        'junior software developer new grad',
    ],
    data: [
        'new grad data scientist 2025 2026',
        'entry level data engineer new graduate',
        'junior data analyst new grad',
    ],
};

export async function scrapeLinkedIn(browser, filterSenior = true) {
    const jobs = [];
    const page = await browser.newPage();

    // Realistic browser headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });

    try {
        for (const [category, queries] of Object.entries(SEARCH_QUERIES)) {
            // Just use the first query to avoid rate limits
            const query = queries[0];
            const url = `${BASE_URL}?keywords=${encodeURIComponent(query)}&f_TPR=r86400&sortBy=DD&f_E=1,2`;
            // f_TPR=r86400 = last 24 hours, f_E=1,2 = internship/entry-level

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await sleep(2000 + Math.random() * 2000);

                // Scroll to load more results
                await page.evaluate(() => window.scrollTo(0, 600));
                await sleep(1500);

                const jobData = await page.evaluate(() => {
                    const cards = document.querySelectorAll('.base-card');
                    return Array.from(cards).slice(0, 25).map(card => {
                        const titleEl = card.querySelector('.base-search-card__title');
                        const companyEl = card.querySelector('.base-search-card__subtitle');
                        const locationEl = card.querySelector('.job-search-card__location');
                        const timeEl = card.querySelector('time');
                        const linkEl = card.querySelector('a.base-card__full-link');

                        return {
                            title: titleEl?.textContent?.trim() || '',
                            company: companyEl?.textContent?.trim() || '',
                            location: locationEl?.textContent?.trim() || '',
                            posted_at: timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || '',
                            url: linkEl?.href || '',
                        };
                    }).filter(j => j.title && j.url);
                });

                for (const j of jobData) {
                    if (filterSenior && isSeniorRole(j.title)) continue;
                    if (!j.url) continue;

                    // Clean LinkedIn tracking params from URL
                    const cleanUrl = j.url.split('?')[0];

                    jobs.push({
                        id: makeJobId(cleanUrl),
                        title: j.title,
                        company: j.company,
                        location: j.location,
                        url: cleanUrl,
                        source: 'linkedin',
                        category,
                        salary: null,
                        description: null,
                        posted_at: j.posted_at ? new Date(j.posted_at).toISOString() : new Date().toISOString(),
                    });
                }

                console.log(`✅ LinkedIn [${category}]: found ${jobData.length} jobs (${query})`);
                await sleep(3000 + Math.random() * 2000);
            } catch (err) {
                console.error(`❌ LinkedIn [${category}] error: ${err.message}`);
            }
        }
    } finally {
        await page.close();
    }

    return jobs;
}
