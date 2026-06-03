/**
 * ATS Fetchers — normalized job-list fetchers for every ATS the watcher supports.
 *
 * Each fetcher returns an array of normalized jobs:
 *   { id, title, url, location, posted_at, source }
 *
 * The watcher diffs these by `id` to detect brand-new postings the moment a
 * company's ATS publishes them — which is the same instant they appear on the
 * company's own career portal, and typically well before aggregators index them.
 */

import { makeJobId } from '../utils/helpers.js';

const UA = 'Mozilla/5.0 (compatible; JobHunterPro/1.0)';
const TIMEOUT = 12000;

// Career-page HTML/URL signatures → ATS. Used to "see through" custom career
// pages that are really an ATS under the hood.
export const ATS_URL_PATTERNS = [
    { type: 'greenhouse', regex: /boards\.greenhouse\.io\/([a-z0-9_-]+)/i },
    { type: 'greenhouse', regex: /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i },
    { type: 'lever', regex: /jobs\.lever\.co\/([a-z0-9_-]+)/i },
    { type: 'ashby', regex: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i },
    { type: 'smartrecruiters', regex: /careers\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i },
    { type: 'workable', regex: /apply\.workable\.com\/([a-z0-9-]+)/i },
    { type: 'workable', regex: /([a-z0-9-]+)\.workable\.com/i },
    { type: 'recruitee', regex: /([a-z0-9-]+)\.recruitee\.com/i },
    { type: 'workday', regex: /https?:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^\s"')]+/i },
];

const ATS_TYPES = new Set([
    'greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee',
]);

export function isSupportedAts(type) {
    return ATS_TYPES.has(type);
}

// ── Individual fetchers ───────────────────────────────────────────────────────

async function fetchGreenhouse(slug) {
    const resp = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) throw new Error(`Greenhouse HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.jobs || []).map(j => ({
        id: makeJobId(j.absolute_url || `gh-${slug}-${j.id}`),
        title: j.title || '',
        url: j.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${j.id}`,
        location: j.location?.name || 'US',
        posted_at: j.updated_at ? new Date(j.updated_at).toISOString() : new Date().toISOString(),
        source: 'greenhouse',
    }));
}

async function fetchLever(slug) {
    const resp = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) throw new Error(`Lever HTTP ${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data.map(j => ({
        id: makeJobId(j.hostedUrl || `lever-${slug}-${j.id}`),
        title: j.text || '',
        url: j.hostedUrl || `https://jobs.lever.co/${slug}/${j.id}`,
        location: j.categories?.location || 'US',
        posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
        source: 'lever',
    }));
}

async function fetchAshby(slug) {
    const resp = await fetch(`https://boards-api.ashbyhq.com/posting-api/job-board/${slug}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) throw new Error(`Ashby HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.jobPostings || []).map(j => ({
        id: makeJobId(j.jobUrl || `ashby-${slug}-${j.id}`),
        title: j.title || '',
        url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
        location: j.locationName || j.workplaceType || 'US',
        posted_at: j.publishedAt ? new Date(j.publishedAt).toISOString() : new Date().toISOString(),
        source: 'ashby',
    }));
}

async function fetchSmartRecruiters(slug) {
    const resp = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) throw new Error(`SmartRecruiters HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.content || []).map(j => {
        const loc = [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(', ');
        const url = `https://jobs.smartrecruiters.com/${slug}/${j.id}`;
        return {
            id: makeJobId(url),
            title: j.name || '',
            url,
            location: loc || (j.location?.remote ? 'Remote' : 'US'),
            posted_at: j.releasedDate || j.createdOn || new Date().toISOString(),
            source: 'smartrecruiters',
        };
    });
}

async function fetchWorkable(slug) {
    // Public careers widget JSON (no auth). Falls back gracefully on shape changes.
    const resp = await fetch(`https://www.workable.com/api/accounts/${slug}?details=true`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) throw new Error(`Workable HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.jobs || []).map(j => {
        const url = j.application_url || j.url || j.shortlink || `https://apply.workable.com/${slug}/j/${j.shortcode}`;
        const loc = [j.city, j.state, j.country].filter(Boolean).join(', ');
        return {
            id: makeJobId(url),
            title: j.title || '',
            url,
            location: loc || (j.telecommuting ? 'Remote' : 'US'),
            posted_at: j.published_on ? new Date(j.published_on).toISOString() : new Date().toISOString(),
            source: 'workable',
        };
    });
}

async function fetchRecruitee(slug) {
    const resp = await fetch(`https://${slug}.recruitee.com/api/offers/`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) throw new Error(`Recruitee HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.offers || []).map(j => {
        const url = j.careers_url || j.careers_apply_url || `https://${slug}.recruitee.com/o/${j.slug}`;
        return {
            id: makeJobId(url),
            title: j.title || '',
            url,
            location: j.location || j.city || 'Remote',
            posted_at: j.published_at ? new Date(j.published_at).toISOString() : new Date().toISOString(),
            source: 'recruitee',
        };
    });
}

/**
 * Parse a Workday career URL into the pieces needed for its CXS jobs API.
 *   https://intuit.wd5.myworkdayjobs.com/en-US/External  →
 *   { host: 'intuit.wd5.myworkdayjobs.com', tenant: 'intuit', site: 'External' }
 */
export function parseWorkdayUrl(careerUrl) {
    if (!careerUrl) return null;
    const m = careerUrl.match(/^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(.+)$/i);
    if (!m) return null;
    const [, tenant, wd, rest] = m;
    const host = `${tenant}.${wd}.myworkdayjobs.com`;
    const segs = rest.split(/[?#]/)[0].split('/').filter(Boolean);
    // The site id is the first segment that isn't a locale code (e.g. en-US)
    let site = segs.find(s => !/^[a-z]{2}-[A-Z]{2}$/i.test(s)) || segs[segs.length - 1];
    if (!site) return null;
    return { host, tenant, site };
}

async function fetchWorkday(careerUrl) {
    const wd = parseWorkdayUrl(careerUrl);
    if (!wd) throw new Error('Workday: could not parse tenant/site from career URL');

    const endpoint = `https://${wd.host}/wday/cxs/${wd.tenant}/${wd.site}/jobs`;
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: '' }),
        signal: AbortSignal.timeout(TIMEOUT + 3000),
    });
    if (!resp.ok) throw new Error(`Workday HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.jobPostings || []).map(j => {
        const url = j.externalPath ? `https://${wd.host}${j.externalPath}` : careerUrl;
        return {
            id: makeJobId(url),
            title: j.title || '',
            url,
            location: j.locationsText || 'US',
            // Workday exposes postedOn as a human string ("Posted 3 Days Ago"),
            // so we can't trust it as a date — diffing is by id anyway.
            posted_at: new Date().toISOString(),
            source: 'workday',
        };
    });
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Fetch the current normalized job list for a watched company based on its ATS.
 * @param {{ ats_type: string, ats_slug: string|null, career_url: string|null }} company
 */
export async function fetchAtsJobs({ ats_type, ats_slug, career_url }) {
    switch (ats_type) {
        case 'greenhouse': return fetchGreenhouse(ats_slug);
        case 'lever': return fetchLever(ats_slug);
        case 'ashby': return fetchAshby(ats_slug);
        case 'smartrecruiters': return fetchSmartRecruiters(ats_slug);
        case 'workable': return fetchWorkable(ats_slug);
        case 'recruitee': return fetchRecruitee(ats_slug);
        case 'workday': return fetchWorkday(career_url);
        default: throw new Error(`Unsupported ATS type: ${ats_type}`);
    }
}

/**
 * Inspect a "custom" career page and try to discover the ATS powering it.
 * Many bespoke-looking career pages embed Greenhouse/Lever/Workday/etc.
 * Returns { ats_type, ats_slug, career_url } or null.
 */
export async function resolveEmbeddedAts(careerUrl) {
    if (!careerUrl) return null;
    let html = '';
    let finalUrl = careerUrl;
    try {
        const resp = await fetch(careerUrl, {
            redirect: 'follow',
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(TIMEOUT),
        });
        finalUrl = resp.url || careerUrl;
        html = await resp.text();
    } catch {
        return null;
    }

    const haystack = `${finalUrl}\n${html}`;
    for (const { type, regex } of ATS_URL_PATTERNS) {
        const match = haystack.match(regex);
        if (!match) continue;

        if (type === 'workday') {
            // For Workday we need the full URL to derive tenant + site.
            return { ats_type: 'workday', ats_slug: null, career_url: match[0] };
        }
        const slug = match[1];
        if (!slug || slug.length < 2) continue;
        // Build a canonical career_url for reference/notifications.
        const canonical = {
            greenhouse: `https://boards.greenhouse.io/${slug}`,
            lever: `https://jobs.lever.co/${slug}`,
            ashby: `https://jobs.ashbyhq.com/${slug}`,
            smartrecruiters: `https://careers.smartrecruiters.com/${slug}`,
            workable: `https://apply.workable.com/${slug}`,
            recruitee: `https://${slug}.recruitee.com`,
        }[type] || finalUrl;
        return { ats_type: type, ats_slug: slug, career_url: canonical };
    }
    return null;
}
