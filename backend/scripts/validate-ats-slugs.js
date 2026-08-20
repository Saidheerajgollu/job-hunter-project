/**
 * Validate all preset ATS slugs and attempt auto-fix via career page probing.
 * Usage: node scripts/validate-ats-slugs.js [--fix-career]
 */

import { BAY_AREA_COMPANIES } from '../src/presets/bayAreaCompanies.js';
import { NYC_COMPANIES } from '../src/presets/nycCompanies.js';
import { SEATTLE_COMPANIES } from '../src/presets/seattleCompanies.js';

const UA = 'Mozilla/5.0 (compatible; JobHunterPro/1.0)';
const TIMEOUT = 12000;

const ATS_HTML_PATTERNS = [
    { type: 'greenhouse', regex: /boards\.greenhouse\.io\/([a-z0-9_-]+)/i },
    { type: 'greenhouse', regex: /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i },
    { type: 'lever', regex: /jobs\.lever\.co\/([a-z0-9_-]+)/i },
    { type: 'ashby', regex: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i },
    { type: 'smartrecruiters', regex: /careers\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i },
    { type: 'workable', regex: /apply\.workable\.com\/([a-z0-9-]+)/i },
];

function slugVariants(slug) {
    const v = new Set([slug]);
    if (slug.includes('-')) v.add(slug.replace(/-/g, ''));
    return [...v];
}

async function probe(type, slug) {
    try {
        if (type === 'greenhouse') {
            for (const s of slugVariants(slug)) {
                const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs`, {
                    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
                });
                if (r.ok) {
                    const d = await r.json();
                    return { ok: true, slug: s, count: (d.jobs || []).length };
                }
            }
            return { ok: false, status: 404 };
        }
        if (type === 'lever') {
            const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=1`, {
                headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
            });
            if (r.ok) return { ok: true, slug, count: '?' };
            return { ok: false, status: r.status };
        }
        if (type === 'ashby') {
            const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
                headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT),
            });
            if (r.ok) {
                const d = await r.json();
                const jobs = d.jobs || d.jobPostings || [];
                return { ok: true, slug, count: jobs.length };
            }
            return { ok: false, status: r.status };
        }
        return { ok: true, slug: null, count: 0 };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function probeCareerPage(careerUrl) {
    try {
        const resp = await fetch(careerUrl, {
            redirect: 'follow',
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(TIMEOUT),
        });
        if (!resp.ok) return null;
        const text = resp.url + '\n' + await resp.text();
        for (const { type, regex } of ATS_HTML_PATTERNS) {
            const m = text.match(regex);
            if (m) return { ats_type: type, ats_slug: m[1], career_url: resp.url };
        }
        return { ats_type: 'custom', ats_slug: null, career_url: resp.url };
    } catch {
        return null;
    }
}

function dedupeCompanies(list) {
    const seen = new Map();
    for (const c of list) {
        const key = c.name.toLowerCase();
        if (!seen.has(key)) seen.set(key, c);
    }
    return [...seen.values()];
}

const ALL = dedupeCompanies([
    ...BAY_AREA_COMPANIES,
    ...NYC_COMPANIES,
    ...SEATTLE_COMPANIES,
]);

const atsCompanies = ALL.filter(c => c.ats_type && c.ats_type !== 'custom' && c.ats_slug);

console.log(`\nValidating ${atsCompanies.length} ATS companies...\n`);

const failures = [];
const fixes = [];

for (const c of atsCompanies) {
    const result = await probe(c.ats_type, c.ats_slug);
    if (result.ok) {
        if (result.slug !== c.ats_slug) {
            fixes.push({ ...c, fix: { ats_slug: result.slug }, reason: 'slug variant' });
            console.log(`⚠️  ${c.name}: slug ${c.ats_slug} → ${result.slug} (${result.count} jobs)`);
        } else {
            console.log(`✅ ${c.name} (${c.ats_type}/${c.ats_slug}) — ${result.count} jobs`);
        }
    } else {
        console.log(`❌ ${c.name} (${c.ats_type}/${c.ats_slug}) — failed`);
        const fromCareer = c.career_url ? await probeCareerPage(c.career_url) : null;
        failures.push({ ...c, fromCareer });
        if (fromCareer) {
            console.log(`   → career page suggests: ${fromCareer.ats_type}/${fromCareer.ats_slug || 'none'}`);
            if (fromCareer.ats_type !== 'custom' && fromCareer.ats_slug) {
                const verify = await probe(fromCareer.ats_type, fromCareer.ats_slug);
                if (verify.ok) {
                    fixes.push({ ...c, fix: { ats_type: fromCareer.ats_type, ats_slug: verify.slug || fromCareer.ats_slug, career_url: fromCareer.career_url }, reason: 'career page' });
                } else {
                    fixes.push({ ...c, fix: { ats_type: 'custom', ats_slug: null, career_url: fromCareer.career_url || c.career_url }, reason: 'no public API' });
                }
            } else {
                fixes.push({ ...c, fix: { ats_type: 'custom', ats_slug: null, career_url: fromCareer.career_url || c.career_url }, reason: 'custom page' });
            }
        } else {
            fixes.push({ ...c, fix: { ats_type: 'custom', ats_slug: null }, reason: 'unreachable' });
        }
    }
    await new Promise(r => setTimeout(r, 100));
}

console.log('\n=== SUMMARY ===');
console.log(`Total ATS: ${atsCompanies.length}`);
console.log(`Failures: ${failures.length}`);
console.log(`Suggested fixes: ${fixes.length}\n`);

if (fixes.length) {
    console.log('--- FIXES JSON ---');
    console.log(JSON.stringify(fixes.map(f => ({
        name: f.name,
        was: { ats_type: f.ats_type, ats_slug: f.ats_slug },
        fix: f.fix,
        reason: f.reason,
    })), null, 2));
}
