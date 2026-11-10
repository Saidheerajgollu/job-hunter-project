/**
 * Fills company_domains (company → website, used for logos) in the background:
 * first from the companies' own job links, then — only when unambiguous —
 * from a free company-name lookup. Unknown companies show initials instead.
 */

import { getOpenJobUrls, upsertCompanyDomains, companiesNeedingDomainLookup, getCompanyDomains } from './db.js';
import { domainFromUrl, pickSuggestedDomain } from './utils/companyDomain.js';
import { mapWithConcurrency, sleep } from './utils/helpers.js';

const LOOKUP_URL = 'https://autocomplete.clearbit.com/v1/companies/suggest';

/** Most common company-owned domain among each company's open job links. */
export async function resolveFromJobUrls() {
    const counts = new Map(); // company → Map(domain → n)
    for (const { company, url } of await getOpenJobUrls()) {
        const domain = domainFromUrl(url);
        if (!domain) continue;
        if (!counts.has(company)) counts.set(company, new Map());
        const c = counts.get(company);
        c.set(domain, (c.get(domain) || 0) + 1);
    }
    const rows = [...counts].map(([company, c]) => ({
        company,
        domain: [...c].sort((a, b) => b[1] - a[1])[0][0],
        source: 'feed',
    }));
    await upsertCompanyDomains(rows);
    return rows.length;
}

/** Name lookup for up to `limit` companies still without a website. */
export async function resolveByLookup(limit = 200) {
    const companies = await companiesNeedingDomainLookup(limit);
    const results = await mapWithConcurrency(companies, 3, async (company) => {
        const resp = await fetch(`${LOOKUP_URL}?${new URLSearchParams({ query: company })}`, {
            headers: { 'User-Agent': 'JobHunterPro/1.0' },
            signal: AbortSignal.timeout(10000),
        });
        await sleep(300);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return { company, domain: pickSuggestedDomain(company, await resp.json()), source: 'lookup' };
    });
    // A failed request (Error in its slot) is not recorded, so it is retried next run.
    const rows = results.filter(r => r && !(r instanceof Error));
    await upsertCompanyDomains(rows);
    return rows.length;
}

// company → website, refreshed from the database at most every 10 minutes.
let domainCache = null;
let domainCacheAt = 0;

/** Adds `company_domain` (website for the logo, or null) to each job. */
export async function attachCompanyDomains(jobs) {
    if (!domainCache || Date.now() - domainCacheAt > 10 * 60 * 1000) {
        domainCache = await getCompanyDomains();
        domainCacheAt = Date.now();
    }
    return jobs.map(job => ({ ...job, company_domain: domainCache.get(job.company) ?? null }));
}
