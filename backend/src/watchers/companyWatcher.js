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
} from '../db.js';
import { sendPushToAll } from '../utils/pushNotifications.js';
import { makeJobId, classifyCategory, isSeniorRole, sleep } from '../utils/helpers.js';
import { fetchAtsJobs, isSupportedAts, resolveEmbeddedAts } from './atsFetchers.js';

// ── Role Matching ─────────────────────────────────────────────────────────────

function matchesWatchRoles(title, watchRoles) {
    const lower = title.toLowerCase();
    return watchRoles.some(role => lower.includes(role.toLowerCase()));
}

// ── Custom page hashing (last-resort fallback) ─────────────────────────────────

async function fetchCustomPageHash(careerUrl) {
    const resp = await fetch(careerUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
        signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Career page HTTP ${resp.status}`);
    const html = await resp.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : html;
    return crypto.createHash('sha256').update(content).digest('hex');
}

async function handleCustomHash(company) {
    if (!company.career_url) return;
    const newHash = await fetchCustomPageHash(company.career_url);
    const changed = company.last_job_hash && company.last_job_hash !== newHash;
    await updateWatchedCompanyState({ last_job_hash: newHash, last_job_ids: '[]', active_jobs_count: 0, id: company.id });

    if (changed) {
        const payload = {
            title: `Career page changed — ${company.name}`,
            body: 'New postings may have been added. Open their career page to check.',
            url: company.career_url,
            company: company.name,
        };
        await sendPushToAll(payload);
        await insertWatchNotification({ company_id: company.id, company_name: company.name, job_title: 'Career page update', job_url: company.career_url });
        await incrementWatchNotifyCount(company.id);
    }
}

// ── Shared diff + notify for ATS-backed companies ──────────────────────────────

async function processAtsJobs(company, allJobs, watchRoles) {
    const matchingJobs = allJobs.filter(j => matchesWatchRoles(j.title, watchRoles) && !isSeniorRole(j.title));

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
        if (!category) continue;
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

async function watchOneCompany(company) {
    const watchRoles = JSON.parse(company.watch_roles || '["software engineer"]');

    // Direct ATS — the fast, reliable path.
    if (isSupportedAts(company.ats_type)) {
        const jobs = await fetchAtsJobs(company);
        return processAtsJobs(company, jobs, watchRoles);
    }

    // Custom / unknown — try to discover an embedded ATS before hashing.
    if (company.career_url) {
        const discovered = await resolveEmbeddedAts(company.career_url);
        if (discovered && isSupportedAts(discovered.ats_type)) {
            console.log(`🔎 [${company.name}]: discovered ${discovered.ats_type} ATS — upgrading from custom`);
            await updateWatchedCompanyAts({ ...discovered, id: company.id });
            const upgraded = { ...company, ...discovered };
            const jobs = await fetchAtsJobs(upgraded);
            return processAtsJobs(upgraded, jobs, watchRoles);
        }
    }

    // Last resort: hash-diff the page.
    return handleCustomHash(company);
}

// ── Public Entry Point ────────────────────────────────────────────────────────

export async function runCompanyWatcher() {
    const all = await getWatchedCompanies();
    const companies = all.filter(c => c.status !== 'paused');
    if (companies.length === 0) return;

    console.log(`\n👁  Company Watcher — checking ${companies.length} companies...`);

    for (const company of companies) {
        try {
            await watchOneCompany(company);
        } catch (err) {
            console.error(`❌ Watcher [${company.name}]: ${err.message}`);
            await updateWatchedCompanyError(err.message.slice(0, 200), company.id);
        }
        await sleep(300);
    }

    console.log('✅ Company Watcher complete');
}
