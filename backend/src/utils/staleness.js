/**
 * Pure diff logic for detecting closed job listings.
 *
 * Given the currently-open DB rows for one source + one poll's set of polled
 * companies, and the URLs that poll actually found, decides which rows are
 * still missing and whether they've crossed the close threshold. Contains
 * no I/O — db.js's closeStaleJobs() is the thin wrapper that fetches rows,
 * calls this, and issues the UPDATE.
 */
export function computeStaleUpdates(existingOpenJobs, freshUrls, missThreshold = 2) {
    const toIncrement = [];
    const toClose = [];

    for (const job of existingOpenJobs) {
        if (freshUrls.has(job.url)) continue;

        if (job.missed_count + 1 >= missThreshold) {
            toClose.push(job.id);
        } else {
            toIncrement.push(job.id);
        }
    }

    return { toIncrement, toClose };
}
