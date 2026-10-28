/**
 * Google Careers Scraper — server-rendered results page, no key.
 *   GET https://www.google.com/about/careers/applications/jobs/results/?q=..&location=United States&sort_by=date
 *
 * FIRST PAGE ONLY (~20 newest per query): google.com/robots.txt disallows the
 * paginated results URLs (`?page=`), so we never request them. Results include
 * other Alphabet companies (YouTube, DeepMind), so the card's employer is used.
 */

import { sleep, CAREER_SITE_TERMS, fetchWithRetry } from '../utils/helpers.js';
import { toCareerSiteJob, dedupeByUrl } from './careerSiteCommon.js';

const BASE = 'https://www.google.com/about/careers/applications/jobs/results/';
const LINK_RE = /href="jobs\/results\/(\d+-[^"?#]+)/g;
const H3_RE = /<h3\b[^>]*>([^<]+)<\/h3>/g;
const EMPLOYER_RE = /<p class="l103df">([\s\S]*?)<\/p>/g;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, m => ENTITIES[m]).replace(/\s+/g, ' ').trim();

function lastMatch(re, text) {
    let last = null;
    for (const m of text.matchAll(re)) last = m;
    return last;
}

export function parseGoogleHtml(html, filterSenior) {
    const jobs = [];
    let prev = 0;
    for (const link of html.matchAll(LINK_RE)) {
        // A card's title and employer line come before its "Learn more" link.
        const card = html.slice(prev, link.index);
        prev = link.index + link[0].length;

        const title = lastMatch(H3_RE, card);
        if (!title) continue;
        const employerLine = lastMatch(EMPLOYER_RE, card);
        const [employer, ...locParts] = employerLine
            ? decode(employerLine[1].replace(/<[^>]+>/g, '')).split('|')
            : ['Google'];
        const location = locParts.join('|').replace(/;?\s*\+\d+ more/g, '').trim();

        const job = toCareerSiteJob({
            title: decode(title[1]),
            company: employer.trim() || 'Google',
            location,
            url: `${BASE}${link[1]}`,
            source: 'google',
            // The results page shows no date; it is sorted newest-first, so
            // first sight ≈ posting date. Marked estimated so it never re-fires.
            postedAt: new Date().toISOString(),
            postedAtEstimated: true,
        }, filterSenior);
        if (job) jobs.push(job);
    }
    return jobs;
}

export async function scrapeGoogle(filterSenior = true) {
    const jobs = [];
    for (const term of CAREER_SITE_TERMS) {
        try {
            const params = new URLSearchParams({ q: term, location: 'United States', sort_by: 'date' });
            const resp = await fetchWithRetry(`${BASE}?${params}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            jobs.push(...parseGoogleHtml(await resp.text(), filterSenior));
            await sleep(800);
        } catch (err) {
            console.error(`❌ Google [${term}]: ${err.message}`);
        }
    }
    const out = dedupeByUrl(jobs);
    console.log(`✅ Google: ${out.length} tech jobs`);
    return out;
}
