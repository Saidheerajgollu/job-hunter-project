/**
 * Web Data Commons company-discovery helpers.
 *
 * WDC publishes an annual schema.org JobPosting extract from Common Crawl.
 * Alongside the raw N-Quads data, it includes a pre-aggregated
 * `JobPosting_domain_stats.csv` — one row per domain that had JobPosting
 * markup, with a count of how many distinct postings were found. That's
 * already exactly "which domains have real, structured job data," so
 * there's no need to download or parse the (5GB+) raw N-Quads files for
 * discovery purposes — this reads the small, pre-aggregated file instead.
 *
 * See: https://webdatacommons.org/structureddata/#toc4
 */

/** Parses the tab-separated Domain / #Quads / #Entities / Properties file. */
export function parseDomainStats(csvText) {
    const rows = [];
    const lines = csvText.split('\n');

    for (let i = 1; i < lines.length; i++) { // skip header row
        const line = lines[i].trim();
        if (!line) continue;

        const fields = line.split('\t');
        if (fields.length < 3) continue;

        const domain = fields[0];
        const entityCount = Number(fields[2]);
        if (!domain || !Number.isFinite(entityCount)) continue;

        rows.push({ domain, entityCount });
    }

    return rows;
}

/**
 * Filters domain-stats rows down to new, sufficiently-active candidates.
 * @param {{domain: string, entityCount: number}[]} domainStats
 * @param {Set<string>} knownDomains - domains already covered elsewhere (case-insensitive)
 * @param {{minEntities: number, limit: number}} options
 */
export function selectCandidateDomains(domainStats, knownDomains, { minEntities, limit }) {
    const knownLower = new Set([...knownDomains].map(d => d.toLowerCase()));

    return domainStats
        .filter(row => !knownLower.has(row.domain.toLowerCase()))
        .filter(row => row.entityCount >= minEntities)
        .sort((a, b) => b.entityCount - a.entityCount)
        .slice(0, limit);
}
