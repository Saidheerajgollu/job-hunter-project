/**
 * Repair watched companies with wrong ATS slugs/types.
 * Applies verified overrides, re-probes APIs, and falls back to custom monitoring.
 */

import { ATS_OVERRIDES } from '../presets/atsOverrides.js';
import { detectATS } from '../utils/atsDetector.js';
import { fetchAtsJobs, resolveEmbeddedAts, isSupportedAts } from './atsFetchers.js';
import { getWatchedCompanies, updateWatchedCompanyAts } from '../db.js';
import { sleep } from '../utils/helpers.js';

const SUPPORTED_DETECT_TYPES = new Set([
    'greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee', 'custom',
]);

async function verifyAts(company) {
    if (!isSupportedAts(company.ats_type)) return { ok: true, mode: 'custom' };
    try {
        await fetchAtsJobs(company);
        return { ok: true, mode: 'api' };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function resolveWorkingAts(company) {
    const override = ATS_OVERRIDES[company.name];
    if (override) {
        const candidate = { ...company, ...override };
        const check = await verifyAts(candidate);
        if (check.ok || override.ats_type === 'custom') {
            return { ...override, source: 'override' };
        }
    }

    const detected = await detectATS(company.name, company.domain);
    if (detected.ats_type !== 'unknown' && SUPPORTED_DETECT_TYPES.has(detected.ats_type)) {
        const candidate = {
            ats_type: detected.ats_type,
            ats_slug: detected.ats_slug,
            career_url: detected.career_url || company.career_url,
        };
        const check = await verifyAts(candidate);
        if (check.ok) return { ...candidate, source: 'detect' };
    }

    if (company.career_url) {
        const embedded = await resolveEmbeddedAts(company.career_url, false);
        if (embedded?.ats_type && isSupportedAts(embedded.ats_type)) {
            const check = await verifyAts(embedded);
            if (check.ok) return { ...embedded, source: 'embed' };
        }
    }

    return {
        ats_type: 'custom',
        ats_slug: null,
        career_url: company.career_url,
        source: 'fallback-custom',
    };
}

/**
 * @returns {{ repaired: number, skipped: number, results: Array }}
 */
export async function repairWatchlist({ onlyErrors = false } = {}) {
    const companies = await getWatchedCompanies();
    const targets = onlyErrors
        ? companies.filter(c => c.status === 'error' || c.error_msg)
        : companies;

    const results = [];
    let repaired = 0;
    let skipped = 0;

    for (const company of targets) {
        const hasOverride = Boolean(ATS_OVERRIDES[company.name]);
        const currentCheck = await verifyAts(company);

        if (!hasOverride && currentCheck.ok && company.status !== 'error' && !company.error_msg) {
            skipped++;
            continue;
        }

        const fix = await resolveWorkingAts(company);
        const changed = fix.ats_type !== company.ats_type
            || fix.ats_slug !== company.ats_slug
            || (fix.career_url && fix.career_url !== company.career_url);

        if (changed || company.status === 'error' || company.error_msg) {
            await updateWatchedCompanyAts({
                id: company.id,
                ats_type: fix.ats_type,
                ats_slug: fix.ats_slug,
                career_url: fix.career_url || company.career_url,
            });
            repaired++;
            results.push({
                name: company.name,
                from: { ats_type: company.ats_type, ats_slug: company.ats_slug },
                to: { ats_type: fix.ats_type, ats_slug: fix.ats_slug },
                source: fix.source,
            });
            console.log(`🔧 ${company.name}: ${company.ats_type}/${company.ats_slug} → ${fix.ats_type}/${fix.ats_slug} (${fix.source})`);
        } else {
            skipped++;
        }

        await sleep(150);
    }

    return { repaired, skipped, total: targets.length, results };
}
