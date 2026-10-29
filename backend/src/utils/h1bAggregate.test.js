import { describe, it, expect } from 'vitest';
import { parseLcaDate, isCountedFiling, fiscalYearOf, createAggregator, checkImportSize } from './h1bAggregate.js';

const day = d => d.toISOString().slice(0, 10);

describe('parseLcaDate', () => {
    it('accepts Date objects, Excel serial numbers, US and ISO date strings', () => {
        expect(day(parseLcaDate(new Date('2026-06-30T00:00:00Z')))).toBe('2026-06-30');
        expect(day(parseLcaDate(46203))).toBe('2026-06-30');
        expect(day(parseLcaDate('06/30/2026'))).toBe('2026-06-30');
        expect(day(parseLcaDate('2026-06-30'))).toBe('2026-06-30');
    });

    it('returns null for missing or unparseable values instead of throwing', () => {
        expect(parseLcaDate('garbage')).toBeNull();
        expect(parseLcaDate(null)).toBeNull();
        expect(parseLcaDate(undefined)).toBeNull();
    });
});

describe('isCountedFiling', () => {
    it('counts certified and certified-withdrawn H-1B rows, tolerating case and spacing', () => {
        expect(isCountedFiling({ CASE_STATUS: 'Certified', VISA_CLASS: 'H-1B' })).toBe(true);
        expect(isCountedFiling({ CASE_STATUS: ' certified - withdrawn ', VISA_CLASS: 'h-1b' })).toBe(true);
        expect(isCountedFiling({ CASE_STATUS: 'Certified-Withdrawn', VISA_CLASS: ' H-1B ' })).toBe(true);
    });

    it('skips denied, withdrawn and non-H-1B visa classes', () => {
        expect(isCountedFiling({ CASE_STATUS: 'Denied', VISA_CLASS: 'H-1B' })).toBe(false);
        expect(isCountedFiling({ CASE_STATUS: 'Withdrawn', VISA_CLASS: 'H-1B' })).toBe(false);
        expect(isCountedFiling({ CASE_STATUS: 'Certified', VISA_CLASS: 'E-3 Australian' })).toBe(false);
        expect(isCountedFiling({ CASE_STATUS: 'Certified', VISA_CLASS: 'H-1B1 Chile' })).toBe(false);
    });
});

describe('fiscalYearOf', () => {
    it('uses the US federal fiscal year (Oct–Sep)', () => {
        expect(fiscalYearOf(new Date('2025-09-30T12:00:00Z'))).toBe(2025);
        expect(fiscalYearOf(new Date('2025-10-01T12:00:00Z'))).toBe(2026);
    });
});

describe('createAggregator', () => {
    const row = (o) => ({ CASE_STATUS: 'Certified', VISA_CLASS: 'H-1B', DECISION_DATE: '2026-03-15', ...o });

    it('counts distinct certified H-1B cases per employer and tracks FEINs and latest date', () => {
        const agg = createAggregator();
        agg.add(row({ CASE_NUMBER: 'A1', EMPLOYER_NAME: 'AMAZON COM SERVICES LLC', EMPLOYER_FEIN: '11', DECISION_DATE: '2026-01-10' }));
        agg.add(row({ CASE_NUMBER: 'A2', EMPLOYER_NAME: 'AMAZON COM SERVICES LLC', EMPLOYER_FEIN: '22', DECISION_DATE: '2026-05-20' }));
        agg.add(row({ CASE_NUMBER: 'A2', EMPLOYER_NAME: 'AMAZON COM SERVICES LLC', EMPLOYER_FEIN: '22' })); // duplicate case
        agg.add(row({ CASE_NUMBER: 'A3', EMPLOYER_NAME: 'AMAZON COM SERVICES LLC', CASE_STATUS: 'Denied' }));

        const [amazon] = agg.result();
        expect(amazon).toEqual({
            key: 'amazoncomservices',
            display_name: 'AMAZON COM SERVICES LLC',
            filings: 2,
            last_decision_date: '2026-05-20',
            fein_count: 2,
            min_fy: 2026,
            max_fy: 2026,
        });
    });

    it('also counts a row under its trade (DBA) name', () => {
        const agg = createAggregator();
        agg.add(row({ CASE_NUMBER: 'B1', EMPLOYER_NAME: 'ACME HOLDINGS LLC', TRADE_NAME_DBA: 'Acme Labs', EMPLOYER_FEIN: '5' }));
        const keys = agg.result().map(r => r.key).sort();
        // Strict legal-name keys keep descriptive words like "Holdings".
        expect(keys).toEqual(['acmeholdings', 'acmelabs']);
    });

    it('ignores rows before FY2025 and rows without an employer name', () => {
        const agg = createAggregator();
        agg.add(row({ CASE_NUMBER: 'C1', EMPLOYER_NAME: 'OLDCO INC', DECISION_DATE: '2024-09-30' }));
        agg.add(row({ CASE_NUMBER: 'C2', EMPLOYER_NAME: '  ' }));
        expect(agg.result()).toEqual([]);
    });

    it('never carries personal or extra fields into the result', () => {
        const agg = createAggregator();
        agg.add(row({ CASE_NUMBER: 'D1', EMPLOYER_NAME: 'STRIPE INC', EMPLOYER_FEIN: '9', EMPLOYER_POC_EMAIL: 'x@y.com', AGENT_ATTORNEY_LAST_NAME: 'Doe' }));
        expect(Object.keys(agg.result()[0]).sort()).toEqual(['display_name', 'fein_count', 'filings', 'key', 'last_decision_date', 'max_fy', 'min_fy']);
    });
});


describe('checkImportSize', () => {
    it('refuses an import that produced no employers', () => {
        expect(() => checkImportSize(0, 0)).toThrow(/no employers/i);
        expect(() => checkImportSize(0, 50000, { force: true })).toThrow(/no employers/i);
    });

    it('refuses an import less than half the size of the current table unless forced', () => {
        expect(() => checkImportSize(10000, 50000)).toThrow(/--force/);
        expect(() => checkImportSize(10000, 50000, { force: true })).not.toThrow();
    });

    it('accepts a normal-sized or first import', () => {
        expect(() => checkImportSize(48000, 50000)).not.toThrow();
        expect(() => checkImportSize(40000, 0)).not.toThrow();
    });
});
