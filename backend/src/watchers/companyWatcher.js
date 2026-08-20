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
import { classifyCategory, isSeniorRole, sleep, isEligibleJob } from '../utils/helpers.js';
import { matchesTechWatchRole } from '../utils/roleFilters.js';
import { fetchAtsJobs, isSupportedAts, resolveEmbeddedAts } from './atsFetchers.js';
import { detectATS } from '../utils/atsDetector.js';

// ── Role Matching ─────────────────────────────────────────────────────────────

function matchesWatchJob(job, watchRoles, filterSenior) {
    if (!matchesTechWatchRole(job.title, watchRoles)) return false;
    if (filterSenior && isSeniorRole(job.title)) return false;
    const category = classifyCategory(job.title);
    if (!category) return false;
    return isEligibleJob({ ...job, category });
}

// ── Custom page monitoring (last-resort when no ATS or schema.org data is found) ──

/**
 * Raw-HTML hash-diff monitor for genuinely custom career pages — no known ATS,
 * no schema.org JobPosting markup, just a bespoke page. Only tells you "something
 * changed", not what changed, since there's no structured data to parse.
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

function isRecoverableAtsError(err) {
    return /HTTP 404|HTTP 410|Unsupported ATS/i.test(err?.message || '');
}

async function redetectCompanyAts(company) {
    const detected = await detectATS(company.name, company.domain);
    if (detected.ats_type !== 'unknown' && isSupportedAts(detected.ats_type)) return detected;

    if (company.career_url) {
        const embedded = await resolveEmbeddedAts(company.career_url);
        if (embedded?.ats_type) {
            return {
                ...embedded,
                supported: isSupportedAts(embedded.ats_type),
            };
        }
    }
    return detected;
}

async function runAtsWatch(company, watchRoles, filterSenior) {
    const jobs = await fetchAtsJobs(company);
    return processAtsJobs(company, jobs, watchRoles, filterSenior);
}

async function watchOneCompany(company, filterSenior) {
    const watchRoles = company.watch_roles || null;

    // Direct ATS — the fast, reliable path (free API calls, run every cycle).
    if (isSupportedAts(company.ats_type)) {
        try {
            return await runAtsWatch(company, watchRoles, filterSenior);
        } catch (err) {
            if (!isRecoverableAtsError(err)) throw err;

            console.log(`🔧 [${company.name}] ${err.message} — re-detecting ATS...`);
            const redetected = await redetectCompanyAts(company);

            if (redetected?.supported && isSupportedAts(redetected.ats_type)) {
                console.log(`✅ [${company.name}] upgraded to ${redetected.ats_type} (${redetected.ats_slug || 'embedded'})`);
                await updateWatchedCompanyAts({
                    ats_type: redetected.ats_type,
                    ats_slug: redetected.ats_slug,
                    career_url: redetected.career_url || company.career_url,
                    id: company.id,
                });
                const upgraded = { ...company, ...redetected };
                return runAtsWatch(upgraded, watchRoles, filterSenior);
            }

            if (redetected?.ats_type === 'custom' && redetected.career_url) {
                console.log(`↪️  [${company.name}] falling back to custom page monitor`);
                await updateWatchedCompanyAts({
                    ats_type: 'custom',
                    ats_slug: null,
                    career_url: redetected.career_url,
                    id: company.id,
                });
                company = { ...company, ats_type: 'custom', ats_slug: null, career_url: redetected.career_url };
            } else {
                throw err;
            }
        }
    }

    // Custom / unknown — try to discover an embedded ATS or schema.org data first.
    if (company.career_url) {
        const discovered = await resolveEmbeddedAts(company.career_url);
        if (discovered && isSupportedAts(discovered.ats_type)) {
            console.log(`🔎 [${company.name}]: discovered ${discovered.ats_type} ATS — upgrading from custom`);
            await updateWatchedCompanyAts({ ...discovered, id: company.id });
            const upgraded = { ...company, ...discovered };
            const jobs = await fetchAtsJobs(upgraded);
            return processAtsJobs(upgraded, jobs, watchRoles, filterSenior);
        }
    }

    // Last resort: genuinely custom page, no structured data — hash-diff only.
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
