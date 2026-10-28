/**
 * Company-name matching across sources. The same employer shows up as
 * "Expedia", "Expedia Group" or "Expedia, Inc." depending on the feed, so
 * names are compared in a normalized form.
 */

const SUFFIXES = new Set([
    'inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company',
    'technologies', 'technology', 'group', 'holdings', 'the', 'ai',
]);

export function normalizeCompanyName(name) {
    const words = String(name || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ')
        .replace(/\.(com|io|ai|co)\b/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    const core = words.filter(w => !SUFFIXES.has(w));
    return (core.length ? core : words).join('');
}

/** normalized name → every raw spelling seen in the feed. */
export function buildCompanyIndex(rawNames) {
    const index = new Map();
    for (const raw of rawNames) {
        const key = normalizeCompanyName(raw);
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(raw);
    }
    return index;
}

/** Lookup keys for a watched name: the whole name, each "A / B" part, and a "(alias)". */
export function companyNameKeys(name) {
    const raw = String(name || '');
    const parts = [raw, ...raw.replace(/\([^)]*\)/g, ' ').split('/'), ...[...raw.matchAll(/\(([^)]*)\)/g)].map(m => m[1])];
    return [...new Set(parts.map(normalizeCompanyName).filter(Boolean))];
}
