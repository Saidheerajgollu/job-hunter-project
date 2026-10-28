/**
 * Oracle Cloud HCM (Recruiting Cloud) Scraper — public candidate-experience
 * REST API used by many large employers (JPMorgan Chase, Honeywell, ...), no key.
 *   GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
 *       ?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={site},limit=25,offset=..,keyword="..",sortBy=POSTING_DATES_DESC
 * Public job page: https://{host}/hcmUI/CandidateExperience/en/sites/{site}/job/{Id}
 */

import { sleep, CAREER_SITE_TERMS, fetchWithRetry, mapWithConcurrency } from '../utils/helpers.js';
import { toCareerSiteJob, dedupeByUrl } from './careerSiteCommon.js';

const PAGE_SIZE = 25;
const PAGES_PER_TERM = 2;

export const ORACLE_TENANTS = [
    { company: 'JPMorgan Chase', host: 'jpmc.fa.oraclecloud.com', site: 'CX_1002' },
];

/** Parse a candidate-experience URL into { host, site }, or null. */
export function parseOracleCareerUrl(url) {
    const m = String(url || '').match(/^https?:\/\/([a-z0-9.-]+\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/[a-z-]+\/sites\/([A-Za-z0-9_-]+)/i);
    return m ? { host: m[1].toLowerCase(), site: m[2] } : null;
}

export function parseOracleRequisition(req, tenant, filterSenior) {
    const country = req.PrimaryLocationCountry || '';
    if (country && country !== 'US') return null;
    return toCareerSiteJob({
        title: req.Title,
        company: tenant.company,
        location: req.PrimaryLocation,
        url: `https://${tenant.host}/hcmUI/CandidateExperience/en/sites/${tenant.site}/job/${req.Id}`,
        source: 'oraclecloud',
        postedAt: req.PostedDate,
        description: req.ShortDescriptionStr,
    }, filterSenior);
}

async function scrapeTenant(tenant, filterSenior) {
    const jobs = [];
    for (const term of CAREER_SITE_TERMS) {
        for (let page = 0; page < PAGES_PER_TERM; page++) {
            const finder = `findReqs;siteNumber=${tenant.site},limit=${PAGE_SIZE},offset=${page * PAGE_SIZE},keyword="${term}",sortBy=POSTING_DATES_DESC`;
            const url = `https://${tenant.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=${encodeURIComponent(finder)}`;
            const resp = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const reqs = (await resp.json()).items?.[0]?.requisitionList || [];
            for (const req of reqs) {
                const job = parseOracleRequisition(req, tenant, filterSenior);
                if (job) jobs.push(job);
            }
            if (reqs.length < PAGE_SIZE) break;
            await sleep(300);
        }
    }
    return jobs;
}

export async function scrapeOracleCloud(filterSenior = true, extraTenants = []) {
    const byKey = new Map([...ORACLE_TENANTS, ...extraTenants].map(t => [`${t.host}/${t.site}`.toLowerCase(), t]));
    const results = await mapWithConcurrency([...byKey.values()], 4, async (tenant) => {
        try {
            const jobs = await scrapeTenant(tenant, filterSenior);
            if (jobs.length) console.log(`✅ Oracle [${tenant.company}]: ${jobs.length} tech jobs`);
            return jobs;
        } catch (err) {
            console.error(`❌ Oracle [${tenant.company}]: ${err.message}`);
            return [];
        }
    });
    return dedupeByUrl(results.flat());
}
