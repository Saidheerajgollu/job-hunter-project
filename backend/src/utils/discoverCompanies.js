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

const SIMPLIFY_URL =
    'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json';

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

let cache = null;
let cacheTime = 0;

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
            return { greenhouse: [], lever: [], ashby: [] };
        }

        const listings = await resp.json();

        const greenhouse = new Set();
        const lever = new Set();
        const ashby = new Set();

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
        }

        cache = {
            greenhouse: [...greenhouse],
            lever: [...lever],
            ashby: [...ashby],
        };
        cacheTime = Date.now();

        console.log(
            `🔍 Discovered ${greenhouse.size} Greenhouse | ${lever.size} Lever | ${ashby.size} Ashby companies from SimplifyJobs`
        );
        return cache;
    } catch (err) {
        console.error(`❌ Company discovery failed: ${err.message} — using hardcoded lists only`);
        return { greenhouse: [], lever: [], ashby: [] };
    }
}
