/**
 * One-off scrape: initialize the DB, run every scraper once, then exit.
 * Useful for testing locally or running as a cron job.
 *
 *   npm run scrape
 */

import 'dotenv/config';
import { initDb } from './db.js';
import { runScraper } from './scraper.js';

async function main() {
    await initDb();
    await runScraper();
    process.exit(0);
}

main().catch((err) => {
    console.error('💥 Scrape failed:', err);
    process.exit(1);
});
