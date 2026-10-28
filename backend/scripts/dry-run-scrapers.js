/**
 * Dry run: execute every scraper against live sources WITHOUT touching the DB,
 * and print how many jobs each returns plus how many pass isEligibleJob.
 *
 *   node scripts/dry-run-scrapers.js [nameFilter]
 */
import 'dotenv/config';
import { isEligibleJob } from '../src/utils/helpers.js';
import { discoverATSCompanies } from '../src/utils/discoverCompanies.js';

const only = process.argv[2]?.toLowerCase();
const discovered = await discoverATSCompanies();

const mods = {
    Direct: ['direct.js', 'scrapeDirectCareerPages'],
    SimplifyJobs: ['simplifyjobs.js', 'scrapeSimplifyJobs'],
    Adzuna: ['adzuna.js', 'scrapeAdzuna'],
    RemoteOK: ['remoteok.js', 'scrapeRemoteOK'],
    Remotive: ['remotive.js', 'scrapeRemotive'],
    Himalayas: ['himalayas.js', 'scrapeHimalayas'],
    WeWorkRemotely: ['weworkremotely.js', 'scrapeWeWorkRemotely'],
    TheMuse: ['themuse.js', 'scrapeTheMuse'],
    Jobicy: ['jobicy.js', 'scrapeJobicy'],
    Greenhouse: ['greenhouse.js', 'scrapeGreenhouse', 'greenhouse'],
    Lever: ['lever.js', 'scrapeLever', 'lever'],
    Ashby: ['ashby.js', 'scrapeAshby', 'ashby'],
    Workday: ['workday.js', 'scrapeWorkday'],
    SmartRecruiters: ['smartrecruiters.js', 'scrapeSmartRecruiters', 'smartrecruiters'],
    Workable: ['workable.js', 'scrapeWorkable', 'workable'],
    Recruitee: ['recruitee.js', 'scrapeRecruitee', 'recruitee'],
};

const origLog = console.log;
const results = await Promise.all(Object.entries(mods)
    .filter(([n]) => !only || n.toLowerCase().includes(only))
    .map(async ([name, [file, fnName, discKey]]) => {
        const t0 = Date.now();
        try {
            const mod = await import(`../src/scrapers/${file}`);
            const out = await mod[fnName](true, discKey ? discovered[discKey] : undefined);
            const jobs = Array.isArray(out) ? out : out.jobs;
            const eligible = jobs.filter(isEligibleJob);
            return { name, found: jobs.length, eligible: eligible.length, polled: out.polledCompanies?.length, secs: ((Date.now() - t0) / 1000).toFixed(1), sample: eligible[0] && `${eligible[0].title} @ ${eligible[0].company} | ${eligible[0].location} | ${eligible[0].posted_at}` };
        } catch (err) {
            return { name, error: err.message, secs: ((Date.now() - t0) / 1000).toFixed(1) };
        }
    }));
console.log = origLog;
console.log('\n===== DRY RUN RESULTS =====');
console.table(results.map(({ sample, ...r }) => r));
for (const r of results) if (r.sample) console.log(`${r.name}: ${r.sample}`);
process.exit(0);
