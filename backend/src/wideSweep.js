/**
 * Wide ATS Sweep
 *
 * Every 6 hours, polls every board in the public ATS directory (~28k
 * Greenhouse / Lever / Ashby / Workday companies, see utils/atsDirectory.js)
 * that the 15-minute fast poll doesn't already cover, and keeps only postings
 * from the last WIDE_SWEEP_MAX_AGE_DAYS days (default 30) — the long tail is
 * where most new companies are, but old listings would flood the database.
 *
 * Closed-listing detection runs for the boards swept here too (Greenhouse /
 * Lever / Ashby; never Workday, which is keyword search, not a full listing).
 *
 * Disable with WIDE_SWEEP=false (e.g. on a small free-tier database).
 */

import { scrapeGreenhouse, GREENHOUSE_COMPANIES } from './scrapers/greenhouse.js';
import { scrapeLever, LEVER_COMPANIES } from './scrapers/lever.js';
import { scrapeAshby, ASHBY_COMPANIES } from './scrapers/ashby.js';
import { scrapeWorkday, WORKDAY_COMPANIES, workdayBoardKey } from './scrapers/workday.js';
import { fetchAtsDirectory, isFreshJob } from './utils/atsDirectory.js';
import { discoverATSCompanies, emptyDiscovery } from './utils/discoverCompanies.js';
import { parseWorkdayUrl } from './watchers/atsFetchers.js';
import { saveAndClose, getCorePolledCompanies } from './fastPoll.js';
import { getAllSettings, getDeadBoards, recordBoardResults } from './db.js';

export function wideSweepEnabled() {
    return process.env.WIDE_SWEEP !== 'false';
}

function maxAgeDays() {
    const n = Number(process.env.WIDE_SWEEP_MAX_AGE_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Drop boards whose company name the fast poll also uses for this source, and
 * keep only fresh postings. Same-name boards would otherwise have their jobs
 * closed by the fast poll's closer, which matches rows by source + company.
 */
export function prepareWideResult(result, coreNames, ageDays, now = Date.now()) {
    const collides = name => coreNames.has(name);
    return {
        jobs: result.jobs.filter(j => !collides(j.company) && isFreshJob(j, ageDays, now)),
        polledCompanies: result.polledCompanies.filter(n => !collides(n)),
        seenUrls: result.seenUrls,
    };
}

/** Drop Workday tenants the dead-board cache has retired. */
export function skipDeadBoards(companies, deadBoards) {
    return companies.filter(c => {
        const wd = parseWorkdayUrl(c.careerUrl);
        return !wd || !deadBoards.has(workdayBoardKey(wd));
    });
}

/** Directory entries the fast poll doesn't already cover. */
export function selectWideCompanies(directory, discovered) {
    const lower = arr => new Set(arr.map(s => String(s).toLowerCase()));
    const gh = lower([...GREENHOUSE_COMPANIES, ...discovered.greenhouse]);
    const lv = lower([...LEVER_COMPANIES, ...discovered.lever]);
    const ash = lower([...ASHBY_COMPANIES.map(c => c.slug), ...discovered.ashby]);
    const wdKey = c => {
        const wd = parseWorkdayUrl(c.careerUrl);
        return wd ? `${wd.host}/${wd.site}`.toLowerCase() : null;
    };
    const wd = new Set([...WORKDAY_COMPANIES, ...discovered.workday].map(wdKey));

    return {
        greenhouse: directory.greenhouse.filter(s => !gh.has(s.toLowerCase())),
        lever: directory.lever.filter(s => !lv.has(s.toLowerCase())),
        ashby: directory.ashby.filter(s => !ash.has(s.toLowerCase())),
        workday: directory.workday.filter(c => !wd.has(wdKey(c))),
    };
}

export async function runWideSweep() {
    const settings = await getAllSettings();
    const filterSenior = settings.filter_exclude_senior !== 'false';
    const ageDays = maxAgeDays();
    const t0 = Date.now();

    const [directory, discovered] = await Promise.all([
        fetchAtsDirectory(),
        discoverATSCompanies().catch(() => emptyDiscovery()),
    ]);
    const wide = selectWideCompanies(directory, discovered);
    const deadWorkday = await getDeadBoards('workday').catch(() => new Set());
    const workdayBefore = wide.workday.length;
    wide.workday = skipDeadBoards(wide.workday, deadWorkday);
    if (workdayBefore !== wide.workday.length) {
        console.log(`🪦 Skipping ${workdayBefore - wide.workday.length} Workday boards that keep answering "gone"`);
    }
    console.log(`\n🌐 Wide sweep: ${wide.greenhouse.length} Greenhouse | ${wide.lever.length} Lever | ` +
        `${wide.ashby.length} Ashby | ${wide.workday.length} Workday boards, keeping jobs ≤ ${ageDays} days old`);

    // Greenhouse/Lever/Ashby each serve every board from one host: at higher
    // fan-out they throttle and live boards silently fail (career-ops measured
    // this), so 6 in flight. Workday tenants are separate hosts.
    const sources = [
        { name: 'Greenhouse (wide)', source: 'greenhouse', closerEnabled: true,
          fn: () => scrapeGreenhouse(filterSenior, wide.greenhouse, { includeSeed: false, withContent: false, concurrency: 6 }) },
        { name: 'Lever (wide)', source: 'lever', closerEnabled: true,
          fn: () => scrapeLever(filterSenior, wide.lever, { includeSeed: false, concurrency: 6 }) },
        { name: 'Ashby (wide)', source: 'ashby', closerEnabled: true,
          fn: () => scrapeAshby(filterSenior, wide.ashby, { includeSeed: false, concurrency: 6 }) },
        { name: 'Workday (wide)', source: 'workday', closerEnabled: false,
          fn: () => scrapeWorkday(filterSenior, wide.workday, { includeSeed: false, terms: ['software engineer', 'data'], maxPages: 1, concurrency: 16 }) },
    ];

    let totalFound = 0;
    let totalNew = 0;
    const errors = [];

    await Promise.allSettled(sources.map(async ({ name, source, closerEnabled, fn }) => {
        try {
            const result = await fn();
            if (result.boardResults) {
                const { cleared, missed } = await recordBoardResults(source, result.boardResults);
                console.log(`🪦 ${name}: ${missed} board(s) answered "gone", ${cleared} answered normally`);
            }
            const fresh = prepareWideResult(result, getCorePolledCompanies(source), ageDays);
            const { found, newCount } = await saveAndClose(name, source, fresh, closerEnabled);
            totalFound += found;
            totalNew += newCount;
            console.log(`📦 ${name}: ${result.polledCompanies.length} boards, ${found} fresh tech jobs, ${newCount} new`);
        } catch (err) {
            errors.push(`${name}: ${err?.message}`);
            console.error(`❌ ${name}: ${err?.message}`);
        }
    }));

    console.log(`✅ Wide sweep complete in ${((Date.now() - t0) / 60000).toFixed(1)} min — Found: ${totalFound} | New: ${totalNew} | Errors: ${errors.length}`);
    return { totalFound, totalNew, errors };
}
