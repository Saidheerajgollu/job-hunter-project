/**
 * Main scraper orchestrator
 *
 * Runs all API-based scrapers in parallel, deduplicates, and saves to Postgres.
 * There are no browser-based scrapers anymore — every source is a public JSON
 * API or feed, which keeps the backend light, fast, and reliable on Railway.
 */

import { scrapeSimplifyJobs } from './scrapers/simplifyjobs.js';
import { scrapeAdzuna } from './scrapers/adzuna.js';
import { scrapeRemoteOK } from './scrapers/remoteok.js';
import { scrapeRemotive } from './scrapers/remotive.js';
import { scrapeHimalayas } from './scrapers/himalayas.js';
import { scrapeWeWorkRemotely } from './scrapers/weworkremotely.js';
import { scrapeTheMuse } from './scrapers/themuse.js';
import { scrapeJobicy } from './scrapers/jobicy.js';
import { scrapeHackerNewsHiring } from './scrapers/hackernews.js';
import { scrapeAmazon } from './scrapers/amazon.js';
import { scrapeApple } from './scrapers/apple.js';
import { scrapeGoogle } from './scrapers/google.js';
import { scrapeEightfold } from './scrapers/eightfold.js';
import { scrapeByteDance } from './scrapers/bytedance.js';
import { scrapeOracleCloud } from './scrapers/oraclecloud.js';
import { discoverATSCompanies, emptyDiscovery } from './utils/discoverCompanies.js';
import { insertJob, startScrapeRun, finishScrapeRun, getAllSettings, expireUnseenJobs } from './db.js';
import { isEligibleJob } from './utils/helpers.js';


export async function runScraper() {
    const settings = await getAllSettings();
    const filterSenior = settings.filter_exclude_senior !== 'false';

    console.log('\n🚀 Job Hunter Pro — Starting scrape run...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    console.log(`🔍 Filter senior roles: ${filterSenior}`);

    const runId = await startScrapeRun();

    let totalFound = 0;
    let totalNew = 0;
    const errors = [];

    const discovered = await discoverATSCompanies().catch(() => emptyDiscovery());

    // ── API-based scrapers (no browser needed) ─────────────────────────────────
    const apiScrapers = [
        // ── Big-company career sites that don't use a shared ATS ────────────────
        { name: 'Amazon',           fn: () => scrapeAmazon(filterSenior) },
        { name: 'Apple',            fn: () => scrapeApple(filterSenior) },
        { name: 'Google',           fn: () => scrapeGoogle(filterSenior) },
        { name: 'Eightfold',        fn: () => scrapeEightfold(filterSenior, discovered.eightfold) },
        { name: 'TikTok/ByteDance', fn: () => scrapeByteDance(filterSenior) },
        { name: 'Oracle Cloud',     fn: () => scrapeOracleCloud(filterSenior, discovered.oraclecloud) },
        // ── Community-curated new-grad list (always runs) ───────────────────────
        { name: 'SimplifyJobs',     fn: () => scrapeSimplifyJobs(filterSenior) },
        // ── Free job board APIs (always run) ────────────────────────────────────
        { name: 'Adzuna',           fn: () => scrapeAdzuna(filterSenior) },
        { name: 'RemoteOK',         fn: () => scrapeRemoteOK(filterSenior) },
        { name: 'Remotive',         fn: () => scrapeRemotive(filterSenior) },
        { name: 'Himalayas',        fn: () => scrapeHimalayas(filterSenior) },
        { name: 'WeWorkRemotely',   fn: () => scrapeWeWorkRemotely(filterSenior) },
        { name: 'The Muse',         fn: () => scrapeTheMuse(filterSenior) },
        { name: 'Jobicy',           fn: () => scrapeJobicy(filterSenior) },
        { name: 'HN Who is hiring', fn: () => scrapeHackerNewsHiring(filterSenior) },
    ];

    // Each scraper runs independently and saves its own results the moment it
    // finishes — a slow source (e.g. Greenhouse iterating 500+ boards) never
    // blocks a fast one (e.g. SimplifyJobs) from landing jobs in the DB.
    await Promise.allSettled(apiScrapers.map(async ({ name, fn }) => {
        try {
            const found = await fn();
            const newJobs = await saveJobs(found);
            totalFound += found.length;
            totalNew += newJobs;
            console.log(`📦 ${name}: ${found.length} found, ${newJobs} new`);
        } catch (err) {
            const msg = `${name}: ${err?.message}`;
            errors.push(msg);
            console.error(`❌ ${msg}`);
        }
    }));

    // ── Finalize ───────────────────────────────────────────────────────────────
    await finishScrapeRun(totalFound, totalNew, errors.length ? JSON.stringify(errors) : null, runId);

    // Hourly housekeeping: retire listings no source has reported for a week.
    const expired = await expireUnseenJobs(7).catch(() => 0);
    if (expired) console.log(`🧹 Closed ${expired} listing(s) not seen for 7 days`);

    console.log(`\n✅ Scrape complete! Found: ${totalFound} | New: ${totalNew} | Errors: ${errors.length}`);
    console.log('─'.repeat(60));

    return { totalFound, totalNew, errors };
}

/**
 * Insert jobs into the DB, returning the count of actually-new (non-duplicate) jobs.
 * Deduplicates within the batch by URL before hitting the database.
 */
async function saveJobs(jobs) {
    let newCount = 0;
    const seen = new Set();
    for (const job of jobs) {
        if (!isEligibleJob(job)) continue;
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        try {
            const inserted = await insertJob(job);
            if (inserted) newCount++;
        } catch (err) {
            console.error(`DB insert error: ${err.message}`);
        }
    }
    return newCount;
}
