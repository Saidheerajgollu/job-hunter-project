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
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory, TECH_SEARCH_TERMS } from '../utils/helpers.js';
import { parseWorkdayUrl } from '../watchers/atsFetchers.js';

// Each entry: { company, careerUrl }
// careerUrl must match: https://{tenant}.wd{N}.myworkdayjobs.com/{site}[/...]
const WORKDAY_COMPANIES = [
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

async function fetchWorkdayJobs(company, careerUrl) {
    const wd = parseWorkdayUrl(careerUrl);
    if (!wd) {
        console.warn(`⚠️  Workday [${company}]: could not parse career URL: ${careerUrl}`);
        return [];
    }

    const endpoint = `https://${wd.host}/wday/cxs/${wd.tenant}/${wd.site}/jobs`;
    const allJobs = [];

    for (const term of TECH_SEARCH_TERMS) {
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)',
                },
                body: JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: term }),
                signal: AbortSignal.timeout(15000),
            });

            if (!resp.ok) break; // stop trying terms if the endpoint itself is broken

            const data = await resp.json();
            for (const posting of (data.jobPostings || [])) {
                if (posting.externalPath) allJobs.push(posting);
            }

            await sleep(200);
        } catch {
            break;
        }
    }

    // Deduplicate by externalPath
    const seen = new Set();
    return allJobs.filter(j => {
        if (seen.has(j.externalPath)) return false;
        seen.add(j.externalPath);
        return true;
    });
}

export async function scrapeWorkday(filterSenior = true) {
    const jobs = [];
    const polledCompanies = [];

    for (const { company, careerUrl } of WORKDAY_COMPANIES) {
        try {
            const wd = parseWorkdayUrl(careerUrl);
            if (!wd) continue;

            const postings = await fetchWorkdayJobs(company, careerUrl);
            if (postings.length > 0) {
                polledCompanies.push(company);
            }

            for (const posting of postings) {
                const title = posting.title || '';
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = `https://${wd.host}${posting.externalPath}`;
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
                    posted_at: new Date().toISOString(),
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Workday [${company}]: ${postings.length} postings`);
            }
            await sleep(600);
        } catch (err) {
            console.error(`❌ Workday [${company}]: ${err.message}`);
        }
    }

    return { jobs, polledCompanies };
}
