/**
 * Main scraper orchestrator
 *
 * Runs all API-based scrapers in parallel, deduplicates, and saves to Postgres.
 * There are no browser-based scrapers anymore — every source is a public JSON
 * API or feed, which keeps the backend light, fast, and reliable on Railway.
 */

import { scrapeGreenhouse } from './scrapers/greenhouse.js';
import { scrapeLever } from './scrapers/lever.js';
import { scrapeWorkday } from './scrapers/workday.js';
import { scrapeDirectCareerPages } from './scrapers/direct.js';
import { scrapeSimplifyJobs } from './scrapers/simplifyjobs.js';
import { scrapeAdzuna } from './scrapers/adzuna.js';
import { scrapeRemoteOK } from './scrapers/remoteok.js';
import { scrapeRemotive } from './scrapers/remotive.js';
import { scrapeAshby } from './scrapers/ashby.js';
import { scrapeSmartRecruiters } from './scrapers/smartrecruiters.js';
import { scrapeWorkable } from './scrapers/workable.js';
import { scrapeRecruitee } from './scrapers/recruitee.js';
import { scrapeHimalayas } from './scrapers/himalayas.js';
import { scrapeWeWorkRemotely } from './scrapers/weworkremotely.js';
import { scrapeTheMuse } from './scrapers/themuse.js';
import { scrapeJobicy } from './scrapers/jobicy.js';
import { scrapeBigTech } from './scrapers/bigtech.js';
import { scrapePlatformSearch } from './scrapers/platformSearch.js';
import { discoverATSCompanies } from './utils/discoverCompanies.js';
import { insertJob, startScrapeRun, finishScrapeRun, getAllSettings } from './db.js';
import { isEligibleJob } from './utils/helpers.js';
import { isEnabled as contextDevEnabled } from './utils/context.js';


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

    // ── Dynamic company discovery ──────────────────────────────────────────────
    // Fetches the SimplifyJobs listings and extracts ATS slugs, expanding company
    // coverage far beyond the hardcoded lists. Cached for 6 hours.
    const discovered = await discoverATSCompanies().catch(() => ({ greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workable: [], recruitee: [] }));

    // ── API-based scrapers (no browser needed) ─────────────────────────────────
    const apiScrapers = [
        // ── Core ATS scrapers (always run) ──────────────────────────────────────
        { name: 'Greenhouse',       fn: () => scrapeGreenhouse(filterSenior, discovered.greenhouse) },
        { name: 'Lever',            fn: () => scrapeLever(filterSenior, discovered.lever) },
        { name: 'Ashby',            fn: () => scrapeAshby(filterSenior, discovered.ashby) },
        { name: 'SmartRecruiters',  fn: () => scrapeSmartRecruiters(filterSenior, discovered.smartrecruiters) },
        { name: 'Workable',         fn: () => scrapeWorkable(filterSenior, discovered.workable) },
        { name: 'Recruitee',        fn: () => scrapeRecruitee(filterSenior, discovered.recruitee) },
        { name: 'Workday',          fn: () => scrapeWorkday(filterSenior) },
        { name: 'Direct Pages',     fn: () => scrapeDirectCareerPages(filterSenior) },
        { name: 'SimplifyJobs',     fn: () => scrapeSimplifyJobs(filterSenior) },
        // ── Free job board APIs (always run) ────────────────────────────────────
        { name: 'Adzuna',           fn: () => scrapeAdzuna(filterSenior) },
        { name: 'RemoteOK',         fn: () => scrapeRemoteOK(filterSenior) },
        { name: 'Remotive',         fn: () => scrapeRemotive(filterSenior) },
        { name: 'Himalayas',        fn: () => scrapeHimalayas(filterSenior) },
        { name: 'WeWorkRemotely',   fn: () => scrapeWeWorkRemotely(filterSenior) },
        { name: 'The Muse',         fn: () => scrapeTheMuse(filterSenior) },
        { name: 'Jobicy',           fn: () => scrapeJobicy(filterSenior) },
        // ── context.dev scrapers (only when CONTEXT_DEV_API_KEY is set) ─────────
        ...(contextDevEnabled() ? [
            { name: 'BigTech (context.dev)',            fn: () => scrapeBigTech(filterSenior) },
            { name: 'Platform Discovery (context.dev)', fn: () => scrapePlatformSearch(filterSenior) },
        ] : []),
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
