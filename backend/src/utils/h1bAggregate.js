/**
 * Turns US Dept. of Labor LCA disclosure rows (Form ETA-9035) into per-employer
 * H-1B filing counts. Only company-level aggregates come out: contact,
 * attorney and preparer fields are never read.
 */

import { normalizeLegalName } from './companyNames.js';

const MIN_FISCAL_YEAR = 2025;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

/** Date from an Excel cell: Date, Excel serial number, 'MM/DD/YYYY' or 'YYYY-MM-DD'. */
export function parseLcaDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') return Number.isFinite(value) ? new Date(EXCEL_EPOCH_MS + Math.round(value) * DAY_MS) : null;
    const str = String(value).trim();
    let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
    m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return null;
}

const norm = v => String(v ?? '').toLowerCase().replace(/\s+/g, '');

/** Certified (or certified-then-withdrawn) H-1B applications only. */
export function isCountedFiling(row) {
    const status = norm(row.CASE_STATUS);
    return norm(row.VISA_CLASS) === 'h-1b' && (status === 'certified' || status === 'certified-withdrawn');
}

/** US federal fiscal year: Oct 1 starts the next year's FY. */
export function fiscalYearOf(date) {
    return date.getUTCMonth() >= 9 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
}

export function createAggregator() {
    const byKey = new Map();

    function addTo(key, rawName, row, date, fy) {
        let e = byKey.get(key);
        if (!e) {
            e = { cases: new Set(), feins: new Set(), names: new Map(), last: null, minFy: fy, maxFy: fy };
            byKey.set(key, e);
        }
        const caseNo = String(row.CASE_NUMBER ?? '').trim();
        if (!caseNo || e.cases.has(caseNo)) return;
        e.cases.add(caseNo);
        if (row.EMPLOYER_FEIN) e.feins.add(String(row.EMPLOYER_FEIN).trim());
        e.names.set(rawName, (e.names.get(rawName) || 0) + 1);
        if (date && (!e.last || date > e.last)) e.last = date;
        e.minFy = Math.min(e.minFy, fy);
        e.maxFy = Math.max(e.maxFy, fy);
    }

    return {
        add(row) {
            if (!isCountedFiling(row)) return;
            const employer = String(row.EMPLOYER_NAME ?? '').trim();
            if (!employer) return;
            const date = parseLcaDate(row.DECISION_DATE);
            if (!date) return;
            const fy = fiscalYearOf(date);
            if (fy < MIN_FISCAL_YEAR) return;

            const keys = new Set([normalizeLegalName(employer)]);
            const dba = String(row.TRADE_NAME_DBA ?? '').trim();
            if (dba) keys.add(normalizeLegalName(dba));
            for (const key of keys) if (key) addTo(key, employer, row, date, fy);
        },

        result() {
            return [...byKey.entries()].map(([key, e]) => ({
                key,
                display_name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
                filings: e.cases.size,
                last_decision_date: e.last ? e.last.toISOString().slice(0, 10) : null,
                fein_count: e.feins.size,
                min_fy: e.minFy,
                max_fy: e.maxFy,
            }));
        },
    };
}

/**
 * Guard before replacing h1b_employers: an empty result always means a bad
 * file, and a result under half the current table usually does (a wrong
 * file, a renamed column). The site keeps its current data unless forced.
 */
export function checkImportSize(newCount, currentCount, { force = false } = {}) {
    if (newCount === 0) throw new Error('import produced no employers — check the file (wrong file or changed columns?)');
    if (currentCount > 0 && newCount < currentCount * 0.5 && !force) {
        throw new Error(`import produced ${newCount} employers, under half of the ${currentCount} stored now — rerun with --force if this is expected`);
    }
}
