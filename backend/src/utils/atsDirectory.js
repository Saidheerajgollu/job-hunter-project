/**
 * Public ATS company directory — thousands of known Greenhouse / Lever /
 * Ashby / Workday boards, from the MIT-licensed, regularly updated dataset at
 * github.com/Feashliaa/job-board-aggregator (the same list career-ops uses for
 * its reverse ATS scan). Lets the wide sweep reach companies nobody curated.
 *
 * The dataset is third-party input, so every entry is validated against a
 * strict charset before it is ever put into a URL. Cached for 24 hours.
 */

const DATASET_BASE = 'https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data';
const CACHE_TTL = 24 * 60 * 60 * 1000;

const SOURCES = ['greenhouse', 'lever', 'ashby', 'workday'];
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const WORKDAY_RE = /^([a-z0-9][a-z0-9-]{0,62})\|(wd\d{1,3})\|([A-Za-z0-9_-]{1,100})$/i;

let cache = null;
let cacheTime = 0;

/** Validate one dataset; returns slugs (or { company, careerUrl } for Workday). */
export function parseDirectory(source, entries) {
    if (!Array.isArray(entries)) return [];
    const out = [];
    for (const entry of entries) {
        if (typeof entry !== 'string') continue;
        if (source === 'workday') {
            const m = entry.match(WORKDAY_RE);
            if (m) out.push({ company: m[1].charAt(0).toUpperCase() + m[1].slice(1), careerUrl: `https://${m[1]}.${m[2]}.myworkdayjobs.com/${m[3]}` });
        } else if (SLUG_RE.test(entry) && !entry.includes('..')) {
            out.push(entry);
        }
    }
    return out;
}

/** Wide-sweep gate: a real (not estimated) posting date within `maxAgeDays`. */
export function isFreshJob(job, maxAgeDays, now = Date.now()) {
    if (job.posted_at_estimated) return false;
    const t = Date.parse(job.posted_at || '');
    return !Number.isNaN(t) && now - t <= maxAgeDays * 86400000;
}

export async function fetchAtsDirectory() {
    if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;

    const result = {};
    await Promise.all(SOURCES.map(async (source) => {
        try {
            const resp = await fetch(`${DATASET_BASE}/${source}_companies.json`, {
                headers: { 'User-Agent': 'JobHunterPro/1.0' },
                signal: AbortSignal.timeout(60000),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            result[source] = parseDirectory(source, await resp.json());
        } catch (err) {
            console.error(`❌ ATS directory [${source}]: ${err.message}`);
            result[source] = [];
        }
    }));

    console.log(`📚 ATS directory: ${SOURCES.map(s => `${result[s].length} ${s}`).join(' | ')}`);
    if (SOURCES.some(s => result[s].length)) {
        cache = result;
        cacheTime = Date.now();
    }
    return result;
}
