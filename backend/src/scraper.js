/**
 * Main scraper orchestrator
 * Runs all scrapers, deduplicates, and saves to DB
 */

import { chromium } from 'playwright';
import { scrapeLinkedIn } from './scrapers/linkedin.js';
import { scrapeIndeed } from './scrapers/indeed.js';
import { scrapeGreenhouse } from './scrapers/greenhouse.js';
import { scrapeLever } from './scrapers/lever.js';
import { scrapeWorkday } from './scrapers/workday.js';
import { scrapeDirectCareerPages } from './scrapers/direct.js';
import { insertJob, startScrapeRun, finishScrapeRun, getAllSettings } from './db.js';

export async function runScraper() {
    const settings = getAllSettings();
    const filterSenior = settings.filter_exclude_senior !== 'false';

    console.log('\n🚀 Job Hunter Pro — Starting scrape run...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    console.log(`🔍 Filter senior roles: ${filterSenior}`);

    const runInfo = startScrapeRun.run();
    const runId = runInfo.lastInsertRowid;

    let totalFound = 0;
    let totalNew = 0;
    const errors = [];

    // ── API-based scrapers (no browser needed) ─────────────────────────────────
    const apiScrapers = [
        { name: 'Greenhouse', fn: () => scrapeGreenhouse(filterSenior) },
        { name: 'Lever', fn: () => scrapeLever(filterSenior) },
        { name: 'Workday', fn: () => scrapeWorkday(filterSenior) },
        { name: 'Direct Career Pages', fn: () => scrapeDirectCareerPages(filterSenior) },
    ];

    // Run API scrapers in parallel (they're all fetch-based)
    const apiResults = await Promise.allSettled(apiScrapers.map(s => s.fn()));
    for (let i = 0; i < apiResults.length; i++) {
        const result = apiResults[i];
        if (result.status === 'fulfilled') {
            const newJobs = saveJobs(result.value);
            totalFound += result.value.length;
            totalNew += newJobs;
            console.log(`📦 ${apiScrapers[i].name}: ${result.value.length} found, ${newJobs} new`);
        } else {
            const msg = `${apiScrapers[i].name}: ${result.reason?.message}`;
            errors.push(msg);
            console.error(`❌ ${msg}`);
        }
    }

    // ── Browser-based scrapers (LinkedIn, Indeed) ─────────────────────────────
    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
            ],
        });

        // Override navigator.webdriver to avoid bot detection
        await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: 'en-US',
        });

        const browserScrapers = [
            { name: 'LinkedIn', fn: () => scrapeLinkedIn(browser, filterSenior) },
            { name: 'Indeed', fn: () => scrapeIndeed(browser, filterSenior) },
        ];

        for (const scraper of browserScrapers) {
            try {
                const jobs = await scraper.fn();
                const newJobs = saveJobs(jobs);
                totalFound += jobs.length;
                totalNew += newJobs;
                console.log(`📦 ${scraper.name}: ${jobs.length} found, ${newJobs} new`);
            } catch (err) {
                const msg = `${scraper.name}: ${err.message}`;
                errors.push(msg);
                console.error(`❌ ${msg}`);
            }
        }
    } finally {
        if (browser) await browser.close();
    }

    // ── Finalize ───────────────────────────────────────────────────────────────
    finishScrapeRun.run(totalFound, totalNew, errors.length ? JSON.stringify(errors) : null, runId);

    console.log(`\n✅ Scrape complete! Found: ${totalFound} | New: ${totalNew} | Errors: ${errors.length}`);
    console.log('─'.repeat(60));

    return { totalFound, totalNew, errors };
}

/**
 * Insert jobs into DB, returns count of actually-new (non-duplicate) jobs
 */
function saveJobs(jobs) {
    let newCount = 0;
    for (const job of jobs) {
        try {
            const result = insertJob.run(job);
            if (result.changes > 0) newCount++;
        } catch (err) {
            // Duplicate URL — expected, skip silently
            if (!err.message.includes('UNIQUE')) {
                console.error(`DB insert error: ${err.message}`);
            }
        }
    }
    return newCount;
}
