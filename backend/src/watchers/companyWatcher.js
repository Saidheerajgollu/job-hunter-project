/**
 * Company Watchlist Monitor
 *
 * Runs frequently (see scheduler) for each company in watched_companies.
 * For ATS-backed companies it fetches the live job list and diffs by job id,
 * firing push notifications for brand-new postings the moment the company's
 * ATS publishes them — the same instant they hit the company's own career
 * portal, and typically well before aggregators (LinkedIn/Indeed/Simplify)
 * index them. That delta is the "be first" edge.
 *
 * Supported ATS: Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable,
 * Recruitee. For truly custom pages it first tries to discover an embedded ATS;
 * only if that fails does it fall back to HTML hash-diffing.
 */

import crypto from 'crypto';
import {
    getWatchedCompanies,
    updateWatchedCompanyState,
    updateWatchedCompanyError,
    updateWatchedCompanyAts,
    incrementWatchNotifyCount,
    insertWatchNotification,
    insertJob,
    getAllSettings,
} from '../db.js';
import { sendPushToAll } from '../utils/pushNotifications.js';
import { makeJobId, classifyCategory, isSeniorRole, sleep, isEligibleJob } from '../utils/helpers.js';
import { matchesTechWatchRole } from '../utils/roleFilters.js';
import { fetchAtsJobs, isSupportedAts, resolveEmbeddedAts } from './atsFetchers.js';
import { scrapeMarkdown, extractStructured, isEnabled as contextDevEnabled } from '../utils/context.js';

// ── Role Matching ─────────────────────────────────────────────────────────────

function matchesWatchJob(job, watchRoles, filterSenior) {
    if (!matchesTechWatchRole(job.title, watchRoles)) return false;
    if (filterSenior && isSeniorRole(job.title)) return false;
    const category = classifyCategory(job.title);
    if (!category) return false;
    return isEligibleJob({ ...job, category });
}

// ── Custom page monitoring (last-resort when no ATS is found) ─────────────────

// JSON Schema used for structured job extraction (10 credits via context.dev).
const JOB_EXTRACTION_SCHEMA = {
    type: 'object',
    properties: {
        jobs: {
            type: 'array',
            description: 'All open job postings found on this career page',
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Exact job title as listed' },
                    url: { type: 'string', description: 'Direct link to this specific job posting' },
                    location: { type: 'string', description: 'City, state, country or Remote' },
                    department: { type: 'string', description: 'Team or department name' },
                },
                required: ['title'],
            },
        },
    },
    required: ['jobs'],
};

/**
 * context.dev-powered custom page monitor.
 *
 * Step 1 (1 credit): scrape-markdown → hash for change detection.
 * Step 2 (10 credits, only on change): structured extraction → real job titles
 *   + URLs so notifications say "Software Engineer — Austin" not "page changed".
 *
 * Rate-limited to once per hour per company by the caller.
 */
async function handleCustomExtract(company, filterSenior) {
    if (!company.career_url) return;

    // Step 1 — cheap scrape for hash comparison.
    const { markdown } = await scrapeMarkdown(company.career_url, {
        waitForMs: 2000,
        useMainContentOnly: true,
        timeoutMs: 35000,
    });
    const newHash = crypto.createHash('sha256').update(markdown).digest('hex');
    const changed = !!company.last_job_hash && company.last_job_hash !== newHash;

    if (!changed) {
        await updateWatchedCompanyState({
            last_job_hash: newHash,
            last_job_ids: company.last_job_ids || '[]',
            active_jobs_count: company.active_jobs_count || 0,
            id: company.id,
        });
        return;
    }

    // Step 2 — page changed: extract actual job titles (10 credits).
    console.log(`🔄 [${company.name}] custom page changed — extracting jobs (10 credits)`);
    const watchRoles = company.watch_roles || null;

    let extractedJobs = [];
    try {
        const { data } = await extractStructured(company.career_url, JOB_EXTRACTION_SCHEMA, {
            maxPages: 5,
            instructions: 'Extract all open tech job postings (software, data, ML, DevOps). Include every job found regardless of level — we will filter.',
            stopAfterMs: 45000,
        });
        extractedJobs = data.jobs || [];
    } catch (err) {
        // Extraction failed — fall back to generic "page changed" alert.
        console.warn(`⚠️  [${company.name}] extraction failed: ${err.message} — sending generic alert`);
        await sendPushToAll({
            title: `Career page updated — ${company.name}`,
            body: 'New postings may have been added. Open their career page to check.',
            url: company.career_url,
            company: company.name,
        });
        await insertWatchNotification({ company_id: company.id, company_name: company.name, job_title: 'Career page update', job_url: company.career_url });
        await incrementWatchNotifyCount(company.id);
        await updateWatchedCompanyState({ last_job_hash: newHash, last_job_ids: '[]', active_jobs_count: 0, id: company.id });
        return;
    }

    // Filter to matching roles (respects senior setting).
    const matchingJobs = extractedJobs
        .filter(j => j.title && matchesWatchJob({
            title: j.title,
            url: j.url || company.career_url,
            location: j.location || 'United States',
        }, watchRoles, filterSenior))
        .map(j => ({
            id: makeJobId(j.url || `${company.id}-${j.title}`),
            title: j.title,
            url: j.url || company.career_url,
            location: j.location || 'United States',
            source: 'watchlist',
        }));

    const sortedIds = matchingJobs.map(j => j.id).sort();
    const previousIds = new Set(JSON.parse(company.last_job_ids || '[]'));
    const newJobs = matchingJobs.filter(j => !previousIds.has(j.id));

    // Persist new jobs into the main feed.
    for (const job of newJobs) {
        const category = classifyCategory(job.title);
        if (!isEligibleJob({ ...job, category })) continue;
        try {
            await insertJob({ ...job, company: company.name, category, salary: null, description: null });
        } catch { /* duplicate — fine */ }
    }

    // Send notifications, capped to avoid spam.
    const toNotify = newJobs.slice(0, 5);
    for (const job of toNotify) {
        await sendPushToAll({
            title: `New role at ${company.name}`,
            body: `${job.title}${job.location ? ' — ' + job.location : ''}`,
            url: job.url,
            company: company.name,
        });
        await insertWatchNotification({ company_id: company.id, company_name: company.name, job_title: job.title, job_url: job.url });
        await incrementWatchNotifyCount(company.id);
    }

    if (newJobs.length > 5) {
        await sendPushToAll({
            title: `${newJobs.length} new roles at ${company.name}`,
            body: `Including: ${newJobs.slice(0, 3).map(j => j.title).join(', ')}…`,
            url: company.career_url,
            company: company.name,
        });
    }

    await updateWatchedCompanyState({
        last_job_hash: newHash,
        last_job_ids: JSON.stringify(sortedIds),
        active_jobs_count: matchingJobs.length,
        id: company.id,
    });

    if (newJobs.length > 0) {
        console.log(`🔔 [${company.name}]: ${newJobs.length} new jobs extracted via context.dev, ${toNotify.length} notifications sent`);
    }
}

/**
 * Raw-HTML fallback for when context.dev is not configured.
 * Only tells you "something changed", not what — kept for backwards compat.
 */
async function handleCustomHash(company) {
    if (!company.career_url) return;
    const resp = await fetch(company.career_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
        signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Career page HTTP ${resp.status}`);
    const html = await resp.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : html;
    const newHash = crypto.createHash('sha256').update(content).digest('hex');
    const changed = !!company.last_job_hash && company.last_job_hash !== newHash;
    await updateWatchedCompanyState({ last_job_hash: newHash, last_job_ids: '[]', active_jobs_count: 0, id: company.id });

    if (changed) {
        await sendPushToAll({
            title: `Career page changed — ${company.name}`,
            body: 'New postings may have been added. Open their career page to check.',
            url: company.career_url,
            company: company.name,
        });
        await insertWatchNotification({ company_id: company.id, company_name: company.name, job_title: 'Career page update', job_url: company.career_url });
        await incrementWatchNotifyCount(company.id);
    }
}

// ── Shared diff + notify for ATS-backed companies ──────────────────────────────

async function processAtsJobs(company, allJobs, watchRoles, filterSenior) {
    const matchingJobs = allJobs.filter(j => matchesWatchJob(j, watchRoles, filterSenior));

    const sortedIds = matchingJobs.map(j => j.id).sort();
    const newHash = crypto.createHash('sha256').update(sortedIds.join(',')).digest('hex');

    // First run: store state without notifying (don't flood existing jobs).
    if (!company.last_job_hash) {
        await updateWatchedCompanyState({ last_job_hash: newHash, last_job_ids: JSON.stringify(sortedIds), active_jobs_count: matchingJobs.length, id: company.id });
        console.log(`📋 First check [${company.name}]: ${matchingJobs.length} matching jobs stored`);
        return;
    }

    if (newHash === company.last_job_hash) {
        await updateWatchedCompanyState({ last_job_hash: newHash, last_job_ids: JSON.stringify(sortedIds), active_jobs_count: matchingJobs.length, id: company.id });
        return; // No change
    }

    const previousIds = new Set(JSON.parse(company.last_job_ids || '[]'));
    const newJobs = matchingJobs.filter(j => !previousIds.has(j.id));

    // Persist new jobs into the main feed too.
    for (const job of newJobs) {
        const category = classifyCategory(job.title);
        if (!isEligibleJob({ ...job, category })) continue;
        try {
            await insertJob({ ...job, company: company.name, category, salary: null, description: null });
        } catch { /* duplicate — fine */ }
    }

    // One notification per new job, capped to avoid spam.
    const toNotify = newJobs.slice(0, 5);
    for (const job of toNotify) {
        const payload = {
            title: `New role at ${company.name}`,
            body: `${job.title} — ${job.location}`,
            url: job.url,
            company: company.name,
        };
        await sendPushToAll(payload);
        await insertWatchNotification({ company_id: company.id, company_name: company.name, job_title: job.title, job_url: job.url });
        await incrementWatchNotifyCount(company.id);
    }

    if (newJobs.length > 5) {
        await sendPushToAll({
            title: `${newJobs.length} new roles at ${company.name}`,
            body: `Including: ${newJobs.slice(0, 3).map(j => j.title).join(', ')}…`,
            url: company.career_url || newJobs[0]?.url || '/',
            company: company.name,
        });
    }

    await updateWatchedCompanyState({ last_job_hash: newHash, last_job_ids: JSON.stringify(sortedIds), active_jobs_count: matchingJobs.length, id: company.id });
    if (newJobs.length > 0) {
        console.log(`🔔 [${company.name}]: ${newJobs.length} new jobs detected, ${toNotify.length} notifications sent`);
    }
}

// ── Per-company entry ──────────────────────────────────────────────────────────

const ONE_HOUR_MS = 60 * 60 * 1000;

async function watchOneCompany(company, filterSenior) {
    const watchRoles = company.watch_roles || null;

    // Direct ATS — the fast, reliable path (free API calls, run every cycle).
    if (isSupportedAts(company.ats_type)) {
        const jobs = await fetchAtsJobs(company);
        return processAtsJobs(company, jobs, watchRoles, filterSenior);
    }

    // Custom / unknown — try to discover an embedded ATS first.
    // On the very first check (last_job_hash is null), use context.dev scrape-markdown
    // (1 credit) so JS-rendered ATS embeds are visible. On subsequent cycles use
    // free raw fetch — we already know it's a truly custom page.
    if (company.career_url) {
        const isFirstCheck = !company.last_job_hash;
        const discovered = await resolveEmbeddedAts(
            company.career_url,
            isFirstCheck && contextDevEnabled()
        );
        if (discovered && isSupportedAts(discovered.ats_type)) {
            console.log(`🔎 [${company.name}]: discovered ${discovered.ats_type} ATS — upgrading from custom`);
            await updateWatchedCompanyAts({ ...discovered, id: company.id });
            const upgraded = { ...company, ...discovered };
            const jobs = await fetchAtsJobs(upgraded);
            return processAtsJobs(upgraded, jobs, watchRoles, filterSenior);
        }
    }

    // Last resort: custom page monitoring.
    if (contextDevEnabled()) {
        // Rate-limit context.dev calls to once per hour per company.
        // The watcher runs every 30 min, so this prevents repeated credit burn.
        const lastChecked = company.last_checked ? new Date(company.last_checked).getTime() : 0;
        if (Date.now() - lastChecked < ONE_HOUR_MS) {
            return; // Checked within the last hour — skip to conserve credits.
        }
        return handleCustomExtract(company, filterSenior);
    }

    // No context.dev configured: fall back to raw HTML hash-diff.
    return handleCustomHash(company);
}

// ── Public Entry Point ────────────────────────────────────────────────────────

export async function runCompanyWatcher() {
    const all = await getWatchedCompanies();
    const companies = all.filter(c => c.status !== 'paused');
    if (companies.length === 0) return;

    const settings = await getAllSettings();
    const filterSenior = settings.filter_exclude_senior !== 'false';

    console.log(`\n👁  Company Watcher — checking ${companies.length} companies...`);

    for (const company of companies) {
        try {
            await watchOneCompany(company, filterSenior);
        } catch (err) {
            console.error(`❌ Watcher [${company.name}]: ${err.message}`);
            await updateWatchedCompanyError(err.message.slice(0, 200), company.id);
        }
        await sleep(300);
    }

    console.log('✅ Company Watcher complete');
}
