/**
 * Hacker News "Ask HN: Who is hiring?" Scraper — free, no key required
 *
 * Every month HN posts a "Who is hiring?" thread where companies (mostly
 * startups, many not on any ATS we poll) leave one top-level comment each.
 * By convention the first line is a header like:
 *
 *   Company | Role(s) | Location | ONSITE/REMOTE | Salary | ...
 *
 * We parse that header, keep comments whose role classifies as a tech role,
 * and link straight to the comment (it contains the apply instructions).
 *
 * API: https://hn.algolia.com/api (search + full comment tree in one call)
 */

import { makeJobId, isSeniorRole, classifyCategory, isUSCompatible, toIsoDate, NON_US_LOCATION_TERMS } from '../utils/helpers.js';

const ALGOLIA = 'https://hn.algolia.com/api/v1';
const UA = 'JobHunterPro/1.0 (github.com/Saidheerajgollu/job-hunter-project)';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&#x2F;': '/', '&nbsp;': ' ' };

function decodeHtml(str) {
    return str
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(amp|lt|gt|quot|nbsp|#x27|#39|#x2F);/g, m => ENTITIES[m])
        .replace(/\s+/g, ' ')
        .trim();
}

const nonUsRegex = new RegExp(
    `\\b(${NON_US_LOCATION_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i'
);
const LOCATION_HINT = /\b(remote|onsite|on-site|hybrid|in[- ]office|anywhere|worldwide|usa?|united states|nyc|new york|san francisco|sf|bay area|seattle|boston|austin|chicago|los angeles|denver|washington,? dc)\b|,\s*[A-Z]{2}\b/i;

function isLocationLike(segment) {
    return LOCATION_HINT.test(segment) || nonUsRegex.test(segment);
}

/**
 * Split on role-list separators (",", ";", " / ", " & ", " and ") that sit
 * outside parentheses, so "AI Engineer (£30-50k, equity)" stays one role.
 */
function splitRoles(segment) {
    const parts = [];
    let depth = 0;
    let buf = '';
    for (let i = 0; i < segment.length; i++) {
        const ch = segment[i];
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if (depth === 0) {
            const rest = segment.slice(i);
            const sep = rest.match(/^(?:\s*[,;]\s*|\s+\/\s+|\s+&\s+|\s+and\s+)/);
            if (sep) {
                parts.push(buf);
                buf = '';
                i += sep[0].length - 1;
                continue;
            }
        }
        buf += ch;
    }
    parts.push(buf);
    return parts.map(p => p.trim()).filter(Boolean);
}

/** A header segment can list several roles: "PM, Backend Engineer & Data Engineer". */
function pickTechRole(segment) {
    const parts = splitRoles(segment);
    const candidates = parts.length > 1 ? [...parts, segment] : parts;
    for (const role of candidates) {
        // Long candidates are prose that leaked into the header, not a title.
        if (role.length > 70 || /^not\b/i.test(role)) continue;
        const category = classifyCategory(role);
        if (category) return { title: role, category };
    }
    return null;
}

// isUSCompatible's shared term list is tuned for ATS location fields; HN
// headers also use bare "UK"/"EU"/"Global" shorthands.
const NON_US_SHORTHAND = /\b(uk|eu|emea|global|europe|worldwide)\b/i;
const US_SIGNAL = /\b(us|usa|united states|u\.s\.?)\b|,\s*[A-Z]{2}\b/i;

/**
 * Parse one top-level "Who is hiring?" comment into a job, or null when the
 * header doesn't name a recognizable tech role.
 */
export function parseHiringComment(item) {
    if (!item?.text) return null;

    const headerHtml = item.text.split(/<p>/i)[0];
    const header = decodeHtml(headerHtml);
    if (!header) return null;

    const segments = header.split(/\s+[|—–]\s+|\s*\|\s*/).map(s => s.trim()).filter(Boolean);
    if (segments.length < 2) return null;

    // "Shepherd (Series B)" / "PrairieLearn (Remote US)": the parenthetical is
    // either noise or a location — keep it as a location hint when it looks like one.
    const companyMatch = segments[0].match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    const company = (companyMatch ? companyMatch[1] : segments[0]).replace(/https?:\/\/\S+/g, '').trim();
    const companyHint = companyMatch && isLocationLike(companyMatch[2]) ? companyMatch[2].trim() : null;
    if (!company || company.length > 80) return null;

    let role = null;
    let roleIdx = -1;
    for (let i = 1; i < segments.length; i++) {
        role = pickTechRole(segments[i]);
        if (role) { roleIdx = i; break; }
    }
    if (!role) return null;

    const locationParts = [
        ...(companyHint ? [companyHint] : []),
        ...segments.filter((s, i) => i !== 0 && i !== roleIdx && isLocationLike(s)),
    ];

    const url = `https://news.ycombinator.com/item?id=${item.id}`;
    return {
        id: makeJobId(url),
        title: role.title,
        company,
        location: locationParts.join(' | ') || 'See posting',
        url,
        source: 'hackernews',
        category: role.category,
        salary: null,
        description: decodeHtml(item.text).slice(0, 500),
        posted_at: toIsoDate(item.created_at),
    };
}

async function getJson(url) {
    const resp = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

export async function scrapeHackerNewsHiring(filterSenior = true) {
    const jobs = [];
    try {
        // The monthly threads are posted by the `whoishiring` account.
        const search = await getJson(`${ALGOLIA}/search_by_date?tags=story,author_whoishiring&hitsPerPage=10`);
        const story = (search.hits || []).find(h => /who is hiring\?/i.test(h.title || ''));
        if (!story) {
            console.warn('⚠️  HN Who is hiring: no recent thread found');
            return [];
        }

        const thread = await getJson(`${ALGOLIA}/items/${story.objectID}`);
        const comments = thread.children || [];

        for (const item of comments) {
            const job = parseHiringComment(item);
            if (!job) continue;
            if (filterSenior && isSeniorRole(job.title)) continue;
            if (!isUSCompatible(job.location)) continue;
            if (NON_US_SHORTHAND.test(job.location) && !US_SIGNAL.test(job.location)) continue;
            jobs.push(job);
        }

        console.log(`✅ HN [${story.title}]: ${comments.length} comments, ${jobs.length} tech jobs`);
    } catch (err) {
        console.error(`❌ HN Who is hiring: ${err.message}`);
    }
    return jobs;
}
