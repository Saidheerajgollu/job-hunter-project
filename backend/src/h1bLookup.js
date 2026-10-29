/**
 * In-memory H-1B index for the API. The h1b_employers table only changes on a
 * quarterly import, so it is loaded once and refreshed at most every 10 minutes.
 */

import { getH1bEmployers } from './db.js';
import { buildH1bIndex } from './utils/h1bMatch.js';

const TTL_MS = 10 * 60 * 1000;
let cached = null;
let loadedAt = 0;

export async function getH1bIndex() {
    if (!cached || Date.now() - loadedAt > TTL_MS) {
        cached = buildH1bIndex(await getH1bEmployers());
        loadedAt = Date.now();
    }
    return cached;
}

/** Adds `h1b`: summary, 'none' (no usable match), or null (no data imported). */
export function attachH1b(jobs, index) {
    const empty = index.isEmpty();
    return jobs.map(job => ({ ...job, h1b: empty ? null : index.lookup(job.company) }));
}

/** Feed company names that have a matched H-1B record (for the "sponsors only" filter). */
export function h1bCompanyNames(index, feedNames) {
    return feedNames.filter(name => index.lookup(name) !== 'none');
}
