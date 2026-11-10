/**
 * Working out a company's own website, for its logo. A wrong logo misleads,
 * so both rules here prefer "unknown" (the card shows initials) to a guess.
 */

import { normalizeLegalName } from './companyNames.js';

// Hosts that serve job postings for many companies — never a company's own site.
const NOT_COMPANY_HOSTS = [
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'myworkdaysite.com', 'smartrecruiters.com',
    'workable.com', 'recruitee.com', 'eightfold.ai', 'oraclecloud.com', 'icims.com', 'jobvite.com', 'taleo.net',
    'successfactors.com', 'bamboohr.com', 'rippling.com', 'breezy.hr', 'dover.com', 'gem.com', 'paylocity.com',
    'ultipro.com', 'ycombinator.com', 'workatastartup.com', 'linkedin.com', 'indeed.com', 'glassdoor.com',
    'ziprecruiter.com', 'simplify.jobs', 'himalayas.app', 'remoteok.com', 'remotive.com', 'weworkremotely.com',
    'themuse.com', 'jobicy.com', 'adzuna.com', 'builtin.com', 'wellfound.com', 'angel.co', 'google.com',
];
const TWO_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.in', 'com.br', 'co.jp', 'com.sg', 'co.nz']);

/** Registrable domain of a company-owned link ("careers.stripe.com" → "stripe.com"), or null. */
export function domainFromUrl(url) {
    let host;
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
    if (!host.includes('.') || /^\d+(\.\d+){3}$/.test(host)) return null;
    if (NOT_COMPANY_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) return null;
    const labels = host.split('.');
    const lastTwo = labels.slice(-2).join('.');
    return labels.slice(TWO_PART_SUFFIXES.has(lastTwo) && labels.length > 2 ? -3 : -2).join('.');
}

const TRUSTED_TLDS = new Set(['com', 'ai', 'io', 'co', 'tv', 'org', 'net', 'dev', 'app', 'inc', 'tech', 'us', 'so', 'xyz']);

/**
 * From name-lookup suggestions [{ name, domain }], accept only one whose name
 * matches exactly AND whose website is the name itself ("TSYS" → tsys.com).
 */
export function pickSuggestedDomain(company, suggestions) {
    const want = normalizeLegalName(company);
    if (!want) return null;
    for (const s of suggestions || []) {
        if (!s?.domain || normalizeLegalName(s.name) !== want) continue;
        const parts = String(s.domain).toLowerCase().split('.');
        if (parts.length !== 2 || !TRUSTED_TLDS.has(parts[1])) continue;
        if (parts[0].replace(/[^a-z0-9]/g, '') === want) return parts.join('.');
    }
    return null;
}
