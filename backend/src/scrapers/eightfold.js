/**
 * Eightfold Scraper — career sites hosted on Eightfold (Netflix, Microsoft,
 * Qualcomm, ...), no key. Two API generations on the same host:
 *   classic: GET https://{host}/api/apply/v2/jobs?domain=..&start=..&num=10&query=..
 *   PCSX:    GET https://{host}/api/pcsx/search?domain=..&start=..&query=..
 * A tenant migrated to PCSX answers the classic endpoint with
 * {"message": "Not authorized for PCSX"}, so we switch once per tenant.
 * Page size is server-capped at 10. robots.txt allows /api/apply and /api/pcsx.
 */

import { sleep, CAREER_SITE_TERMS, fetchWithRetry, mapWithConcurrency } from '../utils/helpers.js';
import { toCareerSiteJob, dedupeByUrl } from './careerSiteCommon.js';

const PAGE_SIZE = 10;
const PAGES_PER_TERM = 5; // 50 newest-relevance results per term

export const EIGHTFOLD_TENANTS = [
    { company: 'Netflix',   host: 'explore.jobs.netflix.net',    domain: 'netflix.com' },
    { company: 'Microsoft', host: 'apply.careers.microsoft.com', domain: 'microsoft.com' },
    { company: 'Qualcomm',  host: 'qualcomm.eightfold.ai',       domain: 'qualcomm.com' },
];

export function parseEightfoldPage(body, tenant, filterSenior) {
    const payload = body?.data && Array.isArray(body.data.positions) ? body.data : body;
    const jobs = [];
    for (const p of payload?.positions || []) {
        const rawUrl = p.canonicalPositionUrl || p.positionUrl || `/careers/job/${p.id}`;
        const job = toCareerSiteJob({
            title: p.name,
            company: tenant.company,
            location: (p.standardizedLocations || p.locations || [p.location]).filter(Boolean).join(' | '),
            url: rawUrl.startsWith('http') ? rawUrl : `https://${tenant.host}${rawUrl}`,
            source: 'eightfold',
            postedAt: p.t_create || p.postedTs,
            description: p.job_description,
        }, filterSenior);
        if (job) jobs.push(job);
    }
    return { jobs, count: payload?.count ?? 0, rows: (payload?.positions || []).length };
}

function pageUrl(tenant, api, term, start) {
    const params = new URLSearchParams({ domain: tenant.domain, start: String(start), query: term, location: 'United States' });
    if (api === 'v2') params.set('num', String(PAGE_SIZE));
    return `https://${tenant.host}/api/${api === 'v2' ? 'apply/v2/jobs' : 'pcsx/search'}?${params}`;
}

async function fetchPage(tenant, api, term, start) {
    const resp = await fetchWithRetry(pageUrl(tenant, api, term, start), { headers: { Accept: 'application/json' } },
        { retries: 4, baseDelayMs: 2000, maxDelayMs: 32000 });
    const body = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, body };
}

async function scrapeTenant(tenant, filterSenior) {
    const jobs = [];
    let api = 'v2';
    for (const term of CAREER_SITE_TERMS) {
        for (let page = 0; page < PAGES_PER_TERM; page++) {
            let res = await fetchPage(tenant, api, term, page * PAGE_SIZE);
            if (api === 'v2' && /pcsx/i.test(res.body?.message || '')) {
                api = 'pcsx';
                res = await fetchPage(tenant, api, term, page * PAGE_SIZE);
            }
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
            const { jobs: pageJobs, rows } = parseEightfoldPage(res.body, tenant, filterSenior);
            jobs.push(...pageJobs);
            if (rows < PAGE_SIZE) break;
            await sleep(400);
        }
    }
    return jobs;
}

export async function scrapeEightfold(filterSenior = true, extraTenants = []) {
    const byHost = new Map([...EIGHTFOLD_TENANTS, ...extraTenants].map(t => [t.host.toLowerCase(), t]));
    const results = await mapWithConcurrency([...byHost.values()], 3, async (tenant) => {
        try {
            const jobs = await scrapeTenant(tenant, filterSenior);
            console.log(`✅ Eightfold [${tenant.company}]: ${jobs.length} tech jobs`);
            return jobs;
        } catch (err) {
            console.error(`❌ Eightfold [${tenant.company}]: ${err.message}`);
            return [];
        }
    });
    return dedupeByUrl(results.flat());
}
