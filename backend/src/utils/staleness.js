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

const RELIST_GAP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A listing counts as "relisted" only when it had actually been closed (taken
 * down) and comes back after 7+ days unseen. Just not being checked for a
 * while — e.g. while the scraper was down — is not a relist.
 */
export function isRelistRepost({ closed_at, scraped_at }, now = Date.now()) {
    if (!closed_at) return false;
    const last = Date.parse(scraped_at || '');
    return !Number.isNaN(last) && now - last >= RELIST_GAP_MS;
}

// Relative dates ("Posted Today" / "Posted Yesterday", Workday and others)
// shift by a day depending on when we poll, so a repost needs a bigger jump.
export const REPOST_DATE_GAP_MS = 3 * 24 * 60 * 60 * 1000;

/** The portal's posting date moved forward by 3+ days: the role was reposted on the same URL. */
export function isPortalDateRepost(oldPosted, newPosted) {
    if (!oldPosted || !newPosted) return false;
    return newPosted.getTime() - oldPosted.getTime() >= REPOST_DATE_GAP_MS;
}
