/**
 * Workday Job Board Scraper
 * Many large companies (Google, Meta, Apple, Amazon, Microsoft, etc.) use Workday.
 * Workday exposes a REST API endpoint for job searches.
 */

import { makeJobId, isSeniorRole, sleep } from '../utils/helpers.js';

// Companies using Workday with their tenant IDs
const WORKDAY_TENANTS = [
    { company: 'Google', tenant: 'google', url: 'https://www.google.com/about/careers/applications/jobs/results/' },
    { company: 'Meta', tenant: 'meta', subdomain: 'fbcareers' },
    { company: 'Apple', tenant: 'apple', subdomain: 'apple-careers' },
    { company: 'Microsoft', tenant: 'microsoft', subdomain: 'microsoft' },
    { company: 'Amazon', tenant: 'amazon', subdomain: 'amazon' },
    { company: 'Salesforce', tenant: 'salesforce', subdomain: 'salesforce' },
    { company: 'Adobe', tenant: 'adobe', subdomain: 'adobe' },
    { company: 'Intel', tenant: 'intel', subdomain: 'intel' },
    { company: 'Qualcomm', tenant: 'qualcomm', subdomain: 'qualcomm' },
    { company: 'Nvidia', tenant: 'nvidia', subdomain: 'nvidia' },
    { company: 'AMD', tenant: 'amd', subdomain: 'amd' },
    { company: 'Uber', tenant: 'uber', subdomain: 'uber' },
    { company: 'Lyft', tenant: 'lyft', subdomain: 'lyft' },
    { company: 'Twitter/X', tenant: 'twitter', subdomain: 'twitter' },
    { company: 'Oracle', tenant: 'oracle', subdomain: 'oracle' },
    { company: 'ServiceNow', tenant: 'servicenow', subdomain: 'servicenow' },
    { company: 'Workday', tenant: 'workday', subdomain: 'workday' },
    { company: 'Intuit', tenant: 'intuit', subdomain: 'intuit' },
    { company: 'Cisco', tenant: 'cisco', subdomain: 'cisco' },
    { company: 'VMware', tenant: 'vmware', subdomain: 'vmware' },
];

const NEW_GRAD_SEARCH_TERMS = ['new grad', 'university grad', 'campus hire', '2026', 'early career'];
const CATEGORY_KEYWORDS = {
    ai: ['machine learning', 'artificial intelligence', 'ai engineer', 'llm', 'nlp', 'deep learning'],
    data: ['data scientist', 'data engineer', 'data analyst', 'analytics engineer'],
    swe: ['software engineer', 'software developer', 'sde ', 'backend', 'frontend', 'full stack'],
};

function classifyCategory(title) {
    const lower = title.toLowerCase();
    for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
        if (kws.some(kw => lower.includes(kw))) return cat;
    }
    return 'swe';
}

async function fetchWorkdayJobs(tenant) {
    const apiUrl = `https://${tenant.subdomain}.wd1.myworkdayjobs.com/wday/cxs/${tenant.subdomain}/${tenant.subdomain}_Careers/jobs`;

    const body = {
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: 'new grad 2026',
    };

    const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)',
            'Accept': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    return data.jobPostings || [];
}

export async function scrapeWorkday(filterSenior = true) {
    const jobs = [];

    for (const tenant of WORKDAY_TENANTS) {
        if (!tenant.subdomain) continue;
        try {
            const postings = await fetchWorkdayJobs(tenant);

            for (const posting of postings) {
                const title = posting.title || '';
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = posting.externalPath
                    ? `https://${tenant.subdomain}.wd1.myworkdayjobs.com${posting.externalPath}`
                    : null;
                if (!jobUrl) continue;

                const location = posting.locationsText || 'US';
                const postedAt = posting.postedOn
                    ? new Date(posting.postedOn).toISOString()
                    : new Date().toISOString();

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: tenant.company,
                    location,
                    url: jobUrl,
                    source: 'workday',
                    category: classifyCategory(title),
                    salary: null,
                    description: null,
                    posted_at: postedAt,
                });
            }

            if (postings.length > 0) {
                console.log(`✅ Workday [${tenant.company}]: ${postings.length} postings found`);
            }
            await sleep(500);
        } catch (err) {
            console.error(`❌ Workday [${tenant.company}]: ${err.message}`);
        }
    }

    return jobs;
}
