/**
 * node-cron scheduler — runs scraper every 4 hours
 */

import cron from 'node-cron';
import { runScraper } from './scraper.js';

let isRunning = false;

// Run every 4 hours: 0 */4 * * *  (at minute 0, every 4th hour)
export function startScheduler() {
    console.log('⏰ Scheduler initialized — will scrape every 4 hours');

    // Run immediately on startup
    runScraperSafe();

    // Then schedule
    cron.schedule('0 */4 * * *', () => {
        runScraperSafe();
    });
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

export { runScraperSafe as triggerScrape };
