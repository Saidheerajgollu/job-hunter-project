/**
 * Fast ATS Poll
 *
 * Polls the 7 direct-ATS sources (Greenhouse, Lever, Ashby, Workday,
 * SmartRecruiters, Workable, Recruitee) on a faster cadence than the main
 * scraper, and runs the staleness "closer" sweep after each — the same
 * diff-based mechanism the company watchlist already uses for watched
 * companies, generalized here to every company across these sources.
 */

import { scrapeGreenhouse } from './scrapers/greenhouse.js';
import { scrapeLever } from './scrapers/lever.js';
import { scrapeAshby } from './scrapers/ashby.js';
import { scrapeWorkday } from './scrapers/workday.js';
import { scrapeSmartRecruiters } from './scrapers/smartrecruiters.js';
import { scrapeWorkable } from './scrapers/workable.js';
import { scrapeRecruitee } from './scrapers/recruitee.js';
import { discoverATSCompanies } from './utils/discoverCompanies.js';
import { insertJob, closeStaleJobs, getAllSettings } from './db.js';
import { isEligibleJob } from './utils/helpers.js';

async function saveAndClose(name, source, { jobs, polledCompanies }) {
    let newCount = 0;
    const seen = new Set();
    for (const job of jobs) {
        if (!isEligibleJob(job)) continue;
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        try {
            if (await insertJob(job)) newCount++;
        } catch (err) {
            console.error(`DB insert error [${name}]: ${err.message}`);
        }
    }

    // freshUrls comes from the FULL jobs list, not the eligibility-filtered
    // subset — a job that's still on the board but newly fails our own
    // eligibility filters (e.g. its location text changed) must never be
    // mistaken for a closed listing.
    const freshUrls = jobs.map(j => j.url);
    const { closed } = await closeStaleJobs(source, polledCompanies, freshUrls);
    if (closed > 0) console.log(`🔒 ${name}: ${closed} listing(s) marked closed`);

    return { found: jobs.length, newCount };
}

export async function runFastAtsPoll() {
    const settings = await getAllSettings();
    const filterSenior = settings.filter_exclude_senior !== 'false';

    const discovered = await discoverATSCompanies().catch(() => ({
        greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workable: [], recruitee: [],
    }));

    const sources = [
        { name: 'Greenhouse',      source: 'greenhouse',      fn: () => scrapeGreenhouse(filterSenior, discovered.greenhouse) },
        { name: 'Lever',           source: 'lever',           fn: () => scrapeLever(filterSenior, discovered.lever) },
        { name: 'Ashby',           source: 'ashby',           fn: () => scrapeAshby(filterSenior, discovered.ashby) },
        { name: 'Workday',         source: 'workday',         fn: () => scrapeWorkday(filterSenior) },
        { name: 'SmartRecruiters', source: 'smartrecruiters', fn: () => scrapeSmartRecruiters(filterSenior, discovered.smartrecruiters) },
        { name: 'Workable',        source: 'workable',        fn: () => scrapeWorkable(filterSenior, discovered.workable) },
        { name: 'Recruitee',       source: 'recruitee',       fn: () => scrapeRecruitee(filterSenior, discovered.recruitee) },
    ];

    let totalFound = 0;
    let totalNew = 0;
    const errors = [];

    await Promise.allSettled(sources.map(async ({ name, source, fn }) => {
        try {
            const result = await fn();
            const { found, newCount } = await saveAndClose(name, source, result);
            totalFound += found;
            totalNew += newCount;
            console.log(`📦 ${name}: ${found} found, ${newCount} new`);
        } catch (err) {
            const msg = `${name}: ${err?.message}`;
            errors.push(msg);
            console.error(`❌ ${msg}`);
            // Still run the closer with an empty result — a source that
            // threw entirely polled zero companies, so nothing gets closed.
            await closeStaleJobs(source, [], []);
        }
    }));

    console.log(`✅ Fast ATS poll complete! Found: ${totalFound} | New: ${totalNew} | Errors: ${errors.length}`);
    return { totalFound, totalNew, errors };
}
