/**
 * Workday Job Board Scraper
 *
 * Uses each company's public Workday CXS (Career Experience Suite) API —
 * the same JSON endpoint their own career site frontend calls, so no auth
 * is needed for public listings.
 *
 * Each company has a unique subdomain + wd-server + site name.
 * careerUrl is the canonical public career page; the CXS endpoint is derived
 * from it by parseWorkdayUrl() (same function used by companyWatcher).
 *
 * Companies come from the seed list below plus tenants discovered at runtime
 * from SimplifyJobs listings (Workday is the most common ATS there).
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory, mapWithConcurrency, parseWorkdayPostedOn, isWorkdayPostedOnCapped, TECH_SEARCH_TERMS } from '../utils/helpers.js';
import { parseWorkdayUrl, fetchWorkdayPage, workdayJobUrl, WORKDAY_PAGE_SIZE } from '../watchers/atsFetchers.js';

// Each entry: { company, careerUrl }
// careerUrl must match: https://{tenant}.wd{N}.myworkdayjobs.com/{site}[/...]
export const WORKDAY_COMPANIES = [
    // Cloud / SaaS
    { company: 'Salesforce',   careerUrl: 'https://salesforce.wd12.myworkdayjobs.com/External' },
    { company: 'ServiceNow',   careerUrl: 'https://servicenow.wd5.myworkdayjobs.com/External' },
    { company: 'Workday',      careerUrl: 'https://workday.wd5.myworkdayjobs.com/Workday' },
    { company: 'Intuit',       careerUrl: 'https://intuit.wd1.myworkdayjobs.com/External' },
    // Semiconductor / Hardware
    { company: 'Nvidia',       careerUrl: 'https://nvidia.wd5.myworkdayjobs.com/NvidiaExternalCareerSite' },
    { company: 'Intel',        careerUrl: 'https://intel.wd1.myworkdayjobs.com/External' },
    { company: 'Qualcomm',     careerUrl: 'https://qualcomm.wd5.myworkdayjobs.com/External' },
    { company: 'AMD',          careerUrl: 'https://amd.wd1.myworkdayjobs.com/External' },
    // Networking / Security
    { company: 'Cisco',        careerUrl: 'https://cisco.wd5.myworkdayjobs.com/External' },
    { company: 'VMware',       careerUrl: 'https://vmware.wd1.myworkdayjobs.com/Careers' },
    // Creative / Enterprise
    { company: 'Adobe',        careerUrl: 'https://adobe.wd5.myworkdayjobs.com/external_experienced' },
    // Media / Streaming
    { company: 'Netflix',      careerUrl: 'https://netflix.wd5.myworkdayjobs.com/Netflix_External_Site' },
    // Samsung Electronics America (US division)
    { company: 'Samsung (US)', careerUrl: 'https://sec.wd3.myworkdayjobs.com/Samsung_Careers' },
    // Autodesk
    { company: 'Autodesk',     careerUrl: 'https://autodesk.wd1.myworkdayjobs.com/Ext' },
    // Illumina (biotech / data science roles)
    { company: 'Illumina',     careerUrl: 'https://illumina.wd1.myworkdayjobs.com/illumina-careers' },
    // HP Inc
    { company: 'HP',           careerUrl: 'https://hp.wd5.myworkdayjobs.com/ExternalCareerSite' },
];

// Seed companies get the full term list; discovered tenants (hundreds of them)
// get a compact list so one poll stays within a few thousand requests.
const DISCOVERED_SEARCH_TERMS = ['software engineer', 'data', 'machine learning'];
const MAX_PAGES_PER_TERM = 3;   // 60 postings per term
const CONCURRENCY = 10;         // tenants fetched in parallel

async function fetchWorkdayJobs(wd, terms, maxPages = MAX_PAGES_PER_TERM) {
    const allJobs = [];
    let anyOk = false;

    for (const term of terms) {
        try {
            for (let page = 0; page < maxPages; page++) {
                const batch = await fetchWorkdayPage(wd, { searchText: term, offset: page * WORKDAY_PAGE_SIZE, timeoutMs: 15000 });
                anyOk = true;
                for (const posting of batch) {
                    if (posting.externalPath) allJobs.push(posting);
                }
                if (batch.length < WORKDAY_PAGE_SIZE) break;
                await sleep(150);
            }
        } catch {
            // The tenant/site itself is broken (renamed, moved) — no point
            // trying the remaining terms.
            if (!anyOk) break;
        }
        await sleep(150);
    }

    // Deduplicate by externalPath
    const seen = new Set();
    return allJobs.filter(j => {
        if (seen.has(j.externalPath)) return false;
        seen.add(j.externalPath);
        return true;
    });
}

function mergeCompanies(seedList, discovered) {
    const byHost = new Map();
    for (const entry of [...seedList.map(c => ({ ...c, seed: true })), ...discovered]) {
        const wd = parseWorkdayUrl(entry.careerUrl);
        if (!wd) continue;
        const key = `${wd.host}/${wd.site}`.toLowerCase();
        if (!byHost.has(key)) byHost.set(key, { ...entry, wd });
    }
    return [...byHost.values()];
}

/**
 * options (used by the 6-hourly wide sweep over the public ATS directory):
 *   includeSeed  — also poll the hand-picked list above (default true)
 *   terms        — search terms for non-seed tenants
 *   maxPages     — pages (of 20) per term
 *   concurrency  — tenants in flight (each tenant is its own host)
 */
export async function scrapeWorkday(filterSenior = true, discoveredCompanies = [], {
    includeSeed = true, terms = DISCOVERED_SEARCH_TERMS, maxPages = MAX_PAGES_PER_TERM, concurrency = CONCURRENCY,
} = {}) {
    const jobs = [];
    const polledCompanies = [];
    const seenUrls = [];
    const companies = mergeCompanies(includeSeed ? WORKDAY_COMPANIES : [], discoveredCompanies);

    await mapWithConcurrency(companies, concurrency, async ({ company, wd, seed }) => {
        try {
            const postings = await fetchWorkdayJobs(wd, seed ? TECH_SEARCH_TERMS : terms, maxPages);
            // fetchWorkdayJobs returns [] for both "endpoint down" and "zero
            // matching jobs" — indistinguishable. To avoid false negatives
            // (closing valid listings on a transient outage), only count this
            // company as polled when results were actually found.
            if (postings.length > 0) {
                polledCompanies.push(company);
            }

            for (const posting of postings) {
                const jobUrl = workdayJobUrl(wd, posting.externalPath);
                seenUrls.push(jobUrl);

                const title = posting.title || '';
                if (filterSenior && isSeniorRole(title)) continue;

                const category = classifyCategory(title);
                if (!category) continue;

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company,
                    location: posting.locationsText || 'United States',
                    url: jobUrl,
                    source: 'workday',
                    category,
                    salary: null,
                    description: null,
                    // Real posting date from "Posted N Days Ago". Falling back to
                    // now() only when Workday omits it — stamping now() on every
                    // poll made each job look like a fresh repost every day.
                    posted_at: parseWorkdayPostedOn(posting.postedOn) || new Date().toISOString(),
                    posted_at_estimated: !posting.postedOn || isWorkdayPostedOnCapped(posting.postedOn),
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Workday [${company}]: ${postings.length} postings`);
            }
        } catch (err) {
            console.error(`❌ Workday [${company}]: ${err.message}`);
        }
    });

    return { jobs, polledCompanies, seenUrls };
}
