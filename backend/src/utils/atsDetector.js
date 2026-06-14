/**
 * ATS Auto-Detection
 *
 * Given a company name + optional domain, figures out which Applicant Tracking
 * System they use and returns the slug needed to query their jobs API.
 *
 * Strategy:
 *   1. Derive slug variants from the company name/domain
 *   2. Probe Greenhouse, Lever, Ashby APIs in parallel with each variant
 *   3. If no ATS API match: fetch the career page HTML and look for ATS signatures
 *   4. Return { ats_type, ats_slug, career_url, supported }
 */

import { sleep } from './helpers.js';
import { scrapeMarkdown, isEnabled as contextDevEnabled } from './context.js';

const CAREER_PATH_CANDIDATES = [
    '/careers',
    '/jobs',
    '/about/careers',
    '/company/careers',
    '/work-with-us',
    '/join-us',
    '/hiring',
];

// Patterns to search in career page HTML / redirect URLs
const ATS_HTML_PATTERNS = [
    { type: 'greenhouse', regex: /boards\.greenhouse\.io\/([a-z0-9_-]+)/i },
    { type: 'lever', regex: /jobs\.lever\.co\/([a-z0-9_-]+)/i },
    { type: 'ashby', regex: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i },
    { type: 'workday', regex: /([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com/i },
    { type: 'smartrecruiters', regex: /careers\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i },
    { type: 'workable', regex: /apply\.workable\.com\/([a-z0-9-]+)/i },
    { type: 'workable', regex: /([a-z0-9-]+)\.workable\.com/i },
    { type: 'recruitee', regex: /([a-z0-9-]+)\.recruitee\.com/i },
    { type: 'icims', regex: /careers-([a-z0-9-]+)\.icims\.com/i },
    { type: 'taleo', regex: /([a-z0-9-]+)\.taleo\.net/i },
    { type: 'successfactors', regex: /([a-z0-9-]+)\.successfactors\.com/i },
    { type: 'lever', regex: /lever\.co\/([a-z0-9_-]+)/i },
];

function slugVariants(name, domain) {
    const variants = new Set();
    const base = (domain
        ? domain.replace(/\.(com|io|ai|co|net|org|us)$/, '').replace(/^www\./, '')
        : name.toLowerCase()
    );

    const clean = base.toLowerCase().replace(/[^a-z0-9 &]/g, '').trim();

    variants.add(clean.replace(/\s+/g, '-').replace(/-+/g, '-'));
    variants.add(clean.replace(/\s+/g, ''));
    variants.add(clean.replace(/\s+/g, '_'));
    variants.add(clean.replace(/\s*&\s*/g, '-'));
    variants.add(clean.replace(/\s*&\s*/g, ''));

    return [...variants].filter(s => s.length >= 2);
}

async function probeGreenhouse(slug) {
    try {
        const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return false;
        const d = await r.json();
        return Array.isArray(d.jobs);
    } catch { return false; }
}

async function probeLever(slug) {
    try {
        const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=1`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return false;
        const d = await r.json();
        return Array.isArray(d);
    } catch { return false; }
}

async function probeAshby(slug) {
    try {
        const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return false;
        const d = await r.json();
        return Array.isArray(d.jobs) || Array.isArray(d.jobPostings);
    } catch { return false; }
}

async function detectFromHTML(domain) {
    const base = `https://www.${domain}`;
    const urlsToTry = [
        `https://careers.${domain}`,
        `${base}/careers`,
        `https://jobs.${domain}`,
        `${base}/jobs`,
        `${base}/about/careers`,
    ];

    for (const url of urlsToTry) {
        try {
            let searchText = '';
            let finalUrl = url;

            if (contextDevEnabled()) {
                // context.dev scrape: renders JS and exposes embedded iframes —
                // catches Greenhouse/Lever embeds that only appear after JS mounts.
                const { markdown } = await scrapeMarkdown(url, {
                    waitForMs: 2000,
                    includeFrames: true,
                    timeoutMs: 30000,
                });
                searchText = url + '\n' + markdown;
            } else {
                // Raw fetch fallback — misses JS-rendered content.
                const resp = await fetch(url, {
                    redirect: 'follow',
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                    signal: AbortSignal.timeout(10000),
                });
                if (!resp.ok) continue;
                finalUrl = resp.url;
                searchText = finalUrl + '\n' + await resp.text();
            }

            for (const { type, regex } of ATS_HTML_PATTERNS) {
                const match = searchText.match(regex);
                if (match) {
                    return { ats_type: type, ats_slug: match[1] || null, career_url: finalUrl };
                }
            }

            // Found a career page but no recognizable ATS signature.
            return { ats_type: 'custom', ats_slug: null, career_url: finalUrl };
        } catch { /* try next URL */ }
    }

    return { ats_type: 'unknown', ats_slug: null, career_url: null };
}

export async function detectATS(name, domain) {
    const variants = slugVariants(name, domain);
    console.log(`🔍 ATS detection for "${name}" (${domain}) — trying slugs: ${variants.join(', ')}`);

    // Probe all three ATS platforms in parallel across all slug variants
    for (const slug of variants) {
        const [ghOk, lvOk, ashOk] = await Promise.all([
            probeGreenhouse(slug),
            probeLever(slug),
            probeAshby(slug),
        ]);

        if (ghOk) {
            console.log(`✅ "${name}" → Greenhouse board: ${slug}`);
            return { ats_type: 'greenhouse', ats_slug: slug, career_url: `https://boards.greenhouse.io/${slug}`, supported: true };
        }
        if (lvOk) {
            console.log(`✅ "${name}" → Lever board: ${slug}`);
            return { ats_type: 'lever', ats_slug: slug, career_url: `https://jobs.lever.co/${slug}`, supported: true };
        }
        if (ashOk) {
            console.log(`✅ "${name}" → Ashby board: ${slug}`);
            return { ats_type: 'ashby', ats_slug: slug, career_url: `https://jobs.ashbyhq.com/${slug}`, supported: true };
        }

        await sleep(200);
    }

    // Fall back to HTML detection
    if (domain) {
        const result = await detectFromHTML(domain);
        const supported = ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee'].includes(result.ats_type);
        console.log(`🔍 "${name}" HTML detection → ${result.ats_type} (${result.career_url})`);
        return { ...result, supported: supported || result.ats_type === 'custom' };
    }

    return { ats_type: 'unknown', ats_slug: null, career_url: null, supported: false };
}
