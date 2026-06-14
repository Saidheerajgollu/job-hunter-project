/**
 * BigTech Career Scraper — powered by context.dev web search
 *
 * Covers companies with fully custom career platforms that no ATS API reaches:
 *   FAANG+: Google, Meta, Amazon, Microsoft, Apple
 *   Enterprise: IBM, Oracle, SAP, ByteDance/TikTok
 *
 * Strategy: context.dev web search (1 credit / result) with per-company domain
 * filters. Google's index already has these pages crawled, so results are real
 * job-posting URLs with accurate titles.
 *
 * Credit cost: ~180 credits per full run (9 companies × 2 queries × ~10 results).
 * Schedule: daily at 8 AM UTC via scheduler.js.
 *
 * Requires: CONTEXT_DEV_API_KEY environment variable.
 */

import { webSearch, isEnabled } from '../utils/context.js';
import { makeJobId, classifyCategory, isSeniorRole, sleep } from '../utils/helpers.js';

const TARGETS = [
    // ── FAANG / Custom platforms ──────────────────────────────────────────────
    {
        company: 'Google',
        queries: [
            'software engineer careers',
            'machine learning engineer careers',
            'data scientist careers',
        ],
        domains: ['careers.google.com'],
        location: 'United States',
    },
    {
        company: 'Meta',
        queries: [
            'software engineer careers',
            'machine learning engineer careers',
            'data engineer careers',
        ],
        domains: ['metacareers.com'],
        location: 'United States',
    },
    {
        company: 'Amazon',
        queries: [
            'software development engineer careers',
            'machine learning engineer careers',
            'data engineer careers',
        ],
        domains: ['amazon.jobs'],
        location: 'United States',
    },
    {
        company: 'Microsoft',
        queries: [
            'software engineer careers',
            'machine learning engineer careers',
            'data scientist careers',
        ],
        domains: ['careers.microsoft.com', 'jobs.careers.microsoft.com'],
        location: 'United States',
    },
    {
        company: 'Apple',
        queries: [
            'software engineer careers',
            'machine learning engineer careers',
            'data scientist careers',
        ],
        domains: ['jobs.apple.com'],
        location: 'United States',
    },
    // ── Enterprise — custom ATS (SuccessFactors / Taleo / custom) ─────────────
    {
        company: 'IBM',
        queries: [
            'software engineer careers',
            'data scientist engineer careers',
            'AI engineer careers',
        ],
        domains: ['careers.ibm.com'],
        location: 'United States',
    },
    {
        company: 'Oracle',
        queries: [
            'software engineer careers',
            'software developer careers',
            'data engineer careers',
        ],
        domains: ['oracle.com'],
        location: 'United States',
    },
    {
        company: 'SAP',
        queries: [
            'software engineer careers',
            'data engineer careers',
            'machine learning engineer careers',
        ],
        domains: ['jobs.sap.com', 'sap.com'],
        location: 'United States',
    },
    {
        company: 'ByteDance',
        queries: [
            'software engineer careers',
            'machine learning engineer careers',
            'data scientist careers',
        ],
        domains: ['jobs.bytedance.com'],
        location: 'United States',
    },
];

// Strip common company suffixes: "- Google Careers", "| Meta", "at IBM" etc.
const COMPANY_NAMES = TARGETS.map(t => t.company).join('|');
function cleanTitle(raw, company) {
    return raw
        .replace(new RegExp(`\\s*[-–|]\\s*(${COMPANY_NAMES}|Careers|Jobs|Apply|Hiring).*$`, 'i'), '')
        .replace(new RegExp(`\\s+at\\s+${company}\\s*$`, 'i'), '')
        .replace(/\s*\|\s*.*$/, '')
        .trim();
}

function isCareerDomain(url, domains) {
    try {
        const { hostname } = new URL(url);
        return domains.some(d => hostname === d || hostname.endsWith('.' + d));
    } catch {
        return false;
    }
}

export async function scrapeBigTech(filterSenior = true) {
    if (!isEnabled()) {
        console.log('ℹ️  BigTech scraper skipped: CONTEXT_DEV_API_KEY not configured');
        return [];
    }

    const jobs = [];
    const seenUrls = new Set();

    for (const target of TARGETS) {
        for (const query of target.queries) {
            try {
                const { results } = await webSearch(query, {
                    includeDomains: target.domains,
                    freshness: 'last_year',
                });

                for (const result of results) {
                    // Must be an actual career-domain URL, not a news article.
                    if (!isCareerDomain(result.url, target.domains)) continue;
                    if (seenUrls.has(result.url)) continue;
                    seenUrls.add(result.url);

                    const title = cleanTitle(result.title || '', target.company);
                    if (!title || title.length < 4) continue;

                    const category = classifyCategory(title);
                    if (!category) continue;
                    if (filterSenior && isSeniorRole(title)) continue;

                    jobs.push({
                        id: makeJobId(result.url),
                        title,
                        company: target.company,
                        location: target.location,
                        url: result.url,
                        source: 'bigtech',
                        category,
                        salary: null,
                        description: result.description || null,
                        posted_at: null,
                    });
                }

                await sleep(500);
            } catch (err) {
                console.error(`❌ BigTech [${target.company} | "${query}"]: ${err.message}`);
            }
        }

        await sleep(300);
    }

    return jobs;
}
