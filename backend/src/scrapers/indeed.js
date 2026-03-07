/**
 * Indeed Job Scraper
 * Scrapes Indeed public job search results.
 */

import { makeJobId, parsePostedAt, isSeniorRole, sleep } from '../utils/helpers.js';

const SEARCH_QUERIES = {
    ai: [
        { q: 'new grad AI engineer', l: 'United States' },
        { q: 'entry level machine learning engineer', l: 'United States' },
    ],
    swe: [
        { q: 'new grad software engineer 2026', l: 'United States' },
        { q: 'entry level software engineer new graduate', l: 'United States' },
    ],
    data: [
        { q: 'new grad data scientist 2026', l: 'United States' },
        { q: 'entry level data engineer', l: 'United States' },
    ],
};

export async function scrapeIndeed(browser, filterSenior = true) {
    const jobs = [];
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });

    try {
        for (const [category, queries] of Object.entries(SEARCH_QUERIES)) {
            const { q, l } = queries[0];
            const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}&fromage=1&sort=date`;
            // fromage=1 = posted in last 1 day; sort=date = newest first

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await sleep(2000 + Math.random() * 1500);

                const jobData = await page.evaluate(() => {
                    const cards = document.querySelectorAll('[data-jk]');
                    return Array.from(cards).slice(0, 25).map(card => {
                        const titleEl = card.querySelector('[class*="jobTitle"] a, h2 a');
                        const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
                        const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation');
                        const dateEl = card.querySelector('[data-testid="myJobsStateDate"], .date');
                        const jobKey = card.getAttribute('data-jk');

                        return {
                            title: titleEl?.textContent?.trim() || '',
                            company: companyEl?.textContent?.trim() || '',
                            location: locationEl?.textContent?.trim() || '',
                            posted_at: dateEl?.textContent?.trim() || '',
                            url: jobKey ? `https://www.indeed.com/viewjob?jk=${jobKey}` : '',
                        };
                    }).filter(j => j.title && j.url);
                });

                for (const j of jobData) {
                    if (filterSenior && isSeniorRole(j.title)) continue;

                    jobs.push({
                        id: makeJobId(j.url),
                        title: j.title,
                        company: j.company,
                        location: j.location,
                        url: j.url,
                        source: 'indeed',
                        category,
                        salary: null,
                        description: null,
                        posted_at: parsePostedAt(j.posted_at),
                    });
                }

                console.log(`✅ Indeed [${category}]: found ${jobData.length} jobs`);
                await sleep(3000 + Math.random() * 2000);
            } catch (err) {
                console.error(`❌ Indeed [${category}] error: ${err.message}`);
            }
        }
    } finally {
        await page.close();
    }

    return jobs;
}
