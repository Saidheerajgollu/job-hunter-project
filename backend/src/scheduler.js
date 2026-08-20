/**
 * Scheduler
 *
 * Independent loops:
 *   1. Main scraper   — Greenhouse / Lever / Ashby / Workday / SimplifyJobs /
 *                       The Muse / Jobicy.
 *                       Runs immediately on boot, then every hour.
 *   2. Company watcher — diffs each watched company's ATS board, fires push alerts.
 *                       Runs every 30 minutes.
 *   3. JSearch        — LinkedIn / Indeed / Glassdoor via RapidAPI.
 *                       Only runs if RAPIDAPI_KEY is set. Every 12 hours.
 *   4. Fantastic.jobs — broad ATS-board feed via RapidAPI.
 *                       Only runs if FANTASTIC_API_KEY is set. Every 12 hours.
 */

import cron from 'node-cron';
import { runScraper } from './scraper.js';
import { scrapeJSearch } from './scrapers/jsearch.js';
import { scrapeFantasticJobs } from './scrapers/fantasticJobs.js';
import { runCompanyWatcher } from './watchers/companyWatcher.js';
import { runFastAtsPoll } from './fastPoll.js';
import { insertJob, getAllSettings } from './db.js';
import { isEligibleJob } from './utils/helpers.js';

let isRunning = false;
let isJSearchRunning = false;
let isFantasticRunning = false;
let isWatcherRunning = false;
let isFastPollRunning = false;

export function startScheduler() {
    console.log('⏰ Scheduler initialized — main scraper hourly, fast ATS poll every 15 min, watcher every 30 min, JSearch every 12h');

    // Main scraper: defer first run 3 min after boot (avoids startup memory spike), then hourly.
    setTimeout(() => runScraperSafe(), 3 * 60 * 1000);
    cron.schedule('0 * * * *', () => runScraperSafe());

    // Fast ATS poll: the 7 direct-ATS sources (Greenhouse/Lever/Ashby/Workday/
    // SmartRecruiters/Workable/Recruitee), all companies not just watchlisted
    // ones, plus staleness/ghost-job detection. First run 2 min after boot,
    // then every 15 minutes.
    setTimeout(() => runFastAtsPollSafe(), 2 * 60 * 1000);
    cron.schedule('*/15 * * * *', () => runFastAtsPollSafe());

    // Company watcher: first run 1 min after startup, then every 30 minutes.
    // The isWatcherRunning guard skips a cycle if the previous one is still going.
    setTimeout(() => runWatcherSafe(), 60 * 1000);
    cron.schedule('*/30 * * * *', () => runWatcherSafe());

    // JSearch: only if an API key is configured. First run after 30 min, then every 12h.
    if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'your_rapidapi_key_here') {
        setTimeout(() => runJSearchSafe(), 30 * 60 * 1000);
        cron.schedule('0 */12 * * *', () => runJSearchSafe());
    }

    // Fantastic.jobs (Active Jobs DB): optional broad-coverage feed from company
    // ATS boards. First run after 15 min, then every 12h (offset from JSearch).
    if (process.env.FANTASTIC_API_KEY && process.env.FANTASTIC_API_KEY !== 'your_fantastic_key_here') {
        setTimeout(() => runFantasticSafe(), 15 * 60 * 1000);
        cron.schedule('0 2,14 * * *', () => runFantasticSafe());
    }
}

async function runScraperSafe() {
    if (isRunning) {
        console.log('⚠️  Scraper already running, skipping this cycle');
        return;
    }
    isRunning = true;
    try {
        await runScraper();
    } catch (err) {
        console.error('💥 Fatal scraper error:', err);
    } finally {
        isRunning = false;
    }
}

async function runJSearchSafe() {
    if (isJSearchRunning) {
        console.log('⚠️  JSearch already running, skipping');
        return;
    }
    isJSearchRunning = true;
    try {
        const settings = await getAllSettings();
        const filterSenior = settings.filter_exclude_senior !== 'false';

        console.log('\n🌐 JSearch — Starting broad-coverage scrape (LinkedIn/Indeed/Glassdoor...)');
        const jobs = await scrapeJSearch(filterSenior);

        let saved = 0;
        for (const job of jobs) {
            if (!isEligibleJob(job)) continue;
            try {
                if (await insertJob(job)) saved++;
            } catch (err) {
                console.error(`DB insert error: ${err.message}`);
            }
        }
        console.log(`✅ JSearch complete: ${jobs.length} found, ${saved} new`);
    } catch (err) {
        console.error('💥 JSearch error:', err);
    } finally {
        isJSearchRunning = false;
    }
}

async function runFantasticSafe() {
    if (isFantasticRunning) {
        console.log('⚠️  Fantastic.jobs already running, skipping');
        return;
    }
    isFantasticRunning = true;
    try {
        const settings = await getAllSettings();
        const filterSenior = settings.filter_exclude_senior !== 'false';

        console.log('\n🌐 Fantastic.jobs — broad ATS-feed scrape (Active Jobs DB)');
        const jobs = await scrapeFantasticJobs(filterSenior);

        let saved = 0;
        for (const job of jobs) {
            if (!isEligibleJob(job)) continue;
            try {
                if (await insertJob(job)) saved++;
            } catch (err) {
                console.error(`DB insert error: ${err.message}`);
            }
        }
        console.log(`✅ Fantastic.jobs complete: ${jobs.length} found, ${saved} new`);
    } catch (err) {
        console.error('💥 Fantastic.jobs error:', err);
    } finally {
        isFantasticRunning = false;
    }
}

async function runWatcherSafe() {
    if (isWatcherRunning) return;
    isWatcherRunning = true;
    try {
        await runCompanyWatcher();
    } catch (err) {
        console.error('💥 Company watcher error:', err);
    } finally {
        isWatcherRunning = false;
    }
}

async function runFastAtsPollSafe() {
    if (isFastPollRunning) {
        console.log('⚠️  Fast ATS poll already running, skipping this cycle');
        return;
    }
    isFastPollRunning = true;
    try {
        await runFastAtsPoll();
    } catch (err) {
        console.error('💥 Fatal fast-ATS-poll error:', err);
    } finally {
        isFastPollRunning = false;
    }
}

export { runScraperSafe as triggerScrape };
export { runWatcherSafe as triggerWatcher };
export { runFastAtsPollSafe as triggerFastAtsPoll };
