/**
 * Read-time matching of feed companies to aggregated H-1B employers, using
 * strict legal-name keys. A company listed in the alias file is matched to
 * exactly its listed entities. Otherwise a direct name hit is trusted only
 * when it comes from exactly one employer (one FEIN): several employers
 * sharing a name, or a name with no FEIN on record, show "no data" rather
 * than possibly someone else's numbers.
 */

import { legalNameKeys, normalizeLegalName } from './companyNames.js';
import { H1B_ALIASES } from '../presets/h1bAliases.js';

const fy2 = y => String(y % 100).padStart(2, '0');

/** { feed key → Set of employer keys } from { 'Feed Name': ['DOL spelling', ...] }. */
function compileAliases(aliases) {
    const map = new Map();
    for (const [feedName, spellings] of Object.entries(aliases)) {
        const key = normalizeLegalName(feedName);
        const targets = map.get(key) || new Set();
        for (const s of spellings) targets.add(normalizeLegalName(s));
        map.set(key, targets);
    }
    return map;
}

export function buildH1bIndex(rows, aliases = H1B_ALIASES) {
    const byKey = new Map(rows.map(r => [r.key, r]));
    const aliasMap = compileAliases(aliases);

    return {
        isEmpty: () => byKey.size === 0,

        /** H1bSummary | 'none' */
        lookup(companyName) {
            const keys = legalNameKeys(companyName);
            const hits = new Set();
            const aliased = keys.filter(k => aliasMap.has(k));
            if (aliased.length) {
                for (const k of aliased) for (const t of aliasMap.get(k)) if (byKey.has(t)) hits.add(t);
            } else {
                for (const k of keys) {
                    const r = byKey.get(k);
                    if (r && r.fein_count === 1) hits.add(k);
                }
            }
            if (!hits.size) return 'none';

            let filings = 0, last = null, minFy = Infinity, maxFy = -Infinity;
            for (const key of hits) {
                const r = byKey.get(key);
                filings += r.filings;
                if (r.last_decision_date && (!last || r.last_decision_date > last)) last = r.last_decision_date;
                minFy = Math.min(minFy, r.min_fy);
                maxFy = Math.max(maxFy, r.max_fy);
            }
            const fiscal_years = minFy === maxFy ? `FY${fy2(minFy)}` : `FY${fy2(minFy)}–${fy2(maxFy)}`;
            return { filings, last_filed: last, fiscal_years };
        },
    };
}
