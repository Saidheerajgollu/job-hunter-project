import { describe, it, expect } from 'vitest';
import { buildH1bIndex } from './h1bMatch.js';

const row = (o) => ({ display_name: o.key.toUpperCase(), filings: 1, last_decision_date: '2026-03-01', fein_count: 1, min_fy: 2026, max_fy: 2026, ...o });

describe('buildH1bIndex', () => {
    it('matches a feed company through the normalized name', () => {
        const index = buildH1bIndex([row({ key: 'stripe', filings: 40 })], {});
        expect(index.lookup('Stripe, Inc.')).toEqual({ filings: 40, last_filed: '2026-03-01', fiscal_years: 'FY26' });
    });

    it('returns "none" for an ambiguous key (several FEINs, no alias)', () => {
        const index = buildH1bIndex([row({ key: 'box', filings: 9, fein_count: 2 })], {});
        expect(index.lookup('Box')).toBe('none');
    });

    it('sums government entities joined by an alias and skips the ambiguity check for them', () => {
        const index = buildH1bIndex([
            row({ key: 'amazoncomservices', filings: 300, fein_count: 3, last_decision_date: '2026-06-01', min_fy: 2025 }),
            row({ key: 'amazonwebservices', filings: 100, last_decision_date: '2026-04-01' }),
        ], { amazon: ['amazoncomservices', 'amazonwebservices'] });
        expect(index.lookup('Amazon')).toEqual({ filings: 400, last_filed: '2026-06-01', fiscal_years: 'FY25–26' });
    });

    it('counts a government key once even when several of the company keys reach it', () => {
        const index = buildH1bIndex([row({ key: 'google', filings: 50 })], { alphabet: ['google'] });
        expect(index.lookup('Google / Alphabet').filings).toBe(50);
    });

    it('returns "none" when nothing matches, and reports an empty index', () => {
        expect(buildH1bIndex([row({ key: 'stripe' })], {}).lookup('Unknown Co')).toBe('none');
        expect(buildH1bIndex([], {}).isEmpty()).toBe(true);
        expect(buildH1bIndex([row({ key: 'stripe' })], {}).isEmpty()).toBe(false);
    });

    it('uses the built-in alias list by default', () => {
        const index = buildH1bIndex([row({ key: 'amazoncomservices', filings: 7, fein_count: 4 })]);
        expect(index.lookup('Amazon').filings).toBe(7);
    });
});
