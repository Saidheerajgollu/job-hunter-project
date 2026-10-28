/**
 * Dynamic ATS company discovery via SimplifyJobs listings.
 *
 * Fetches the community-maintained new-grad JSON, then parses every job URL
 * to extract Greenhouse / Lever / Ashby company slugs.  The resulting sets
 * are merged with the hardcoded lists in each scraper, giving automatic
 * coverage of any company that SimplifyJobs tracks — without manual curation.
 *
 * Results are cached for 6 hours so the same network round-trip is reused
 * across scrape runs within the same process.
 */

import { parseWorkdayUrl } from '../watchers/atsFetchers.js';

const SIMPLIFY_URL =
    'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json';

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

let cache = null;
let cacheTime = 0;

/** Empty discovery result — used when SimplifyJobs is unreachable. */
export function emptyDiscovery() {
    return { greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workable: [], recruitee: [], workday: [] };
}

export async function discoverATSCompanies() {
    if (cache && Date.now() - cacheTime < CACHE_TTL) {
        return cache;
    }

    try {
        const resp = await fetch(SIMPLIFY_URL, {
            headers: { 'User-Agent': 'JobHunterPro/1.0' },
            signal: AbortSignal.timeout(30000),
        });

        if (!resp.ok) {
            console.warn(`⚠️  Company discovery: HTTP ${resp.status} — using hardcoded lists only`);
            return emptyDiscovery();
        }

        const listings = await resp.json();

        const greenhouse = new Set();
        const lever = new Set();
        const ashby = new Set();
        const smartrecruiters = new Set();
        const workable = new Set();
        const recruitee = new Set();
        // Workday: keyed by host+site so one tenant isn't polled twice; value
        // carries a readable company name (the slug is often opaque, e.g. "globalhr").
        const workday = new Map();

        for (const listing of listings) {
            if (!listing.url) continue;

            // boards.greenhouse.io/{slug}/jobs/{id}
            const gh = listing.url.match(/boards\.greenhouse\.io\/([^/?#]+)/);
            if (gh) greenhouse.add(gh[1].toLowerCase());

            // jobs.lever.co/{slug}/{uuid}
            const lv = listing.url.match(/jobs\.lever\.co\/([^/?#]+)/);
            if (lv) lever.add(lv[1].toLowerCase());

            // jobs.ashbyhq.com/{slug}/{uuid}
            const ash = listing.url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
            if (ash) ashby.add(ash[1].toLowerCase());

            // {careers,jobs}.smartrecruiters.com/{slug}/{jobId} — slug is case-sensitive
            // on the SmartRecruiters API, so it's kept as-is.
            const sr = listing.url.match(/(?:careers|jobs)\.smartrecruiters\.com\/([^/?#]+)/);
            if (sr) smartrecruiters.add(sr[1]);

            // apply.workable.com/{slug}/j/{code} — also case-sensitive on the API.
            const wk = listing.url.match(/apply\.workable\.com\/([^/?#]+)/);
            if (wk) workable.add(wk[1]);

            // {slug}.recruitee.com/o/{jobSlug} — a DNS subdomain, so lowercase is safe.
            const rc = listing.url.match(/([a-z0-9-]+)\.recruitee\.com/i);
            if (rc) recruitee.add(rc[1].toLowerCase());

            // {tenant}.wd{N}.myworkdayjobs.com/[locale/]{site}/job/... — Workday is
            // the single most common ATS in SimplifyJobs listings.
            // Only tenants with a currently-active listing: inactive history
            // spans ~1,300 tenants, far too many to poll every 15 minutes.
            const wd = listing.active ? parseWorkdayUrl(listing.url) : null;
            if (wd) {
                const key = `${wd.host}/${wd.site}`.toLowerCase();
                if (!workday.has(key)) {
                    workday.set(key, {
                        company: listing.company_name || wd.tenant,
                        careerUrl: `https://${wd.host}/${wd.site}`,
                    });
                }
            }
        }

        cache = {
            greenhouse: [...greenhouse],
            lever: [...lever],
            ashby: [...ashby],
            smartrecruiters: [...smartrecruiters],
            workable: [...workable],
            recruitee: [...recruitee],
            workday: [...workday.values()],
        };
        cacheTime = Date.now();

        console.log(
            `🔍 Discovered ${greenhouse.size} Greenhouse | ${lever.size} Lever | ${ashby.size} Ashby | ` +
            `${smartrecruiters.size} SmartRecruiters | ${workable.size} Workable | ${recruitee.size} Recruitee | ` +
            `${workday.size} Workday companies from SimplifyJobs`
        );
        return cache;
    } catch (err) {
        console.error(`❌ Company discovery failed: ${err.message} — using hardcoded lists only`);
        return emptyDiscovery();
    }
}
