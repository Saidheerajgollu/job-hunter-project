/**
 * Shared shaping for company career-site scrapers (Amazon, Apple, Google,
 * Eightfold, ByteDance/TikTok, Oracle Cloud HCM). These sites only offer
 * keyword search, so every result goes through the same tech-role, seniority
 * and US-location gates before it becomes a job row.
 */

import { makeJobId, isSeniorRole, classifyCategory, isUSCompatible, toIsoDate } from '../utils/helpers.js';

/**
 * Build a job row, or null when the posting isn't a US tech role we keep.
 * `postedAtEstimated` marks dates the source doesn't really provide, so
 * insertJob never treats them as a repost or overwrites a stored date.
 */
export function toCareerSiteJob({ title, company, location, url, source, postedAt, postedAtEstimated = false, description = null }, filterSenior) {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || !url) return null;
    if (filterSenior && isSeniorRole(cleanTitle)) return null;

    const category = classifyCategory(cleanTitle, description || '');
    if (!category) return null;

    const loc = (location || '').trim() || 'United States';
    if (!isUSCompatible(loc)) return null;

    return {
        id: makeJobId(url),
        title: cleanTitle,
        company,
        location: loc,
        url,
        source,
        category,
        salary: null,
        description: description ? String(description).slice(0, 500) : null,
        posted_at: toIsoDate(postedAt),
        ...(postedAtEstimated ? { posted_at_estimated: true } : {}),
    };
}

/** Collect jobs from many result batches, keeping the first copy of each URL. */
export function dedupeByUrl(jobs) {
    const seen = new Set();
    return jobs.filter(j => {
        if (seen.has(j.url)) return false;
        seen.add(j.url);
        return true;
    });
}
