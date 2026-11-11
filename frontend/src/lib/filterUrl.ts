import type { JobFilters } from './api';

/** Filters a fresh visit starts with. Only differences from these go in the URL. */
export const DEFAULT_FILTERS: JobFilters = { page: 1, limit: 30, us_only: '1', max_age_days: '30' };

const TEXT_KEYS = [
    'role', 'source', 'search', 'fresh_only', 'has_salary', 'hide_no_sponsorship',
    'h1b_only', 'max_age_days', 'experience', 'us_only', 'work_model', 'e_verify',
] as const;

/** Stands for "the default was switched off" (an empty value can't be told from a missing one). */
const CLEARED = 'any';

/** Query string for the current filters, e.g. "role=swe&work_model=remote". Empty for the defaults. */
export function filtersToQuery(filters: JobFilters): string {
    const params = new URLSearchParams();
    for (const key of TEXT_KEYS) {
        const value = filters[key] ?? '';
        const fallback = DEFAULT_FILTERS[key] ?? '';
        if (value === fallback) continue;
        params.set(key, value === '' ? CLEARED : value);
    }
    if (filters.page && filters.page > 1) params.set('page', String(filters.page));
    return params.toString();
}

/** Filters named in a query string. Unknown keys are ignored. */
export function filtersFromQuery(query: string): Partial<JobFilters> {
    const params = new URLSearchParams(query);
    const out: Partial<JobFilters> = {};
    for (const key of TEXT_KEYS) {
        const value = params.get(key);
        if (value === null) continue;
        // The marker only applies to filters that have a default; a search for "any" stays a search.
        out[key] = value === CLEARED && DEFAULT_FILTERS[key] ? '' : value.slice(0, 100);
    }
    const page = Number(params.get('page'));
    if (Number.isInteger(page) && page > 1) out.page = page;
    return out;
}
