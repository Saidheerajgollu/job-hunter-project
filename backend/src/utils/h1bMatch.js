/**
 * Read-time matching of feed companies to aggregated H-1B employers.
 * A direct name hit is only trusted when it comes from one employer (one
 * FEIN); several unrelated employers sharing a name show "no data" rather
 * than someone else's numbers. Hits through the alias list are trusted.
 */

import { companyNameKeys } from './companyNames.js';
import { H1B_ALIASES } from '../presets/h1bAliases.js';

const fy2 = y => String(y % 100).padStart(2, '0');

export function buildH1bIndex(rows, aliases = H1B_ALIASES) {
    const byKey = new Map(rows.map(r => [r.key, r]));

    return {
        isEmpty: () => byKey.size === 0,

        /** H1bSummary | 'none' */
        lookup(companyName) {
            const keys = companyNameKeys(companyName);
            const hits = new Set();
            for (const key of keys) {
                for (const target of aliases[key] || []) if (byKey.has(target)) hits.add(target);
            }
            const viaAlias = new Set(hits);
            for (const key of keys) {
                const r = byKey.get(key);
                if (r && (r.fein_count < 2 || viaAlias.has(key))) hits.add(key);
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
