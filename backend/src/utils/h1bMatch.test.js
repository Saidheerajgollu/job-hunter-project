import { describe, it, expect } from 'vitest';
import { buildH1bIndex } from './h1bMatch.js';
import { createAggregator } from './h1bAggregate.js';

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
        // "Amazon.com Services LLC" (real DOL spelling) → key "amazonservices"
        const index = buildH1bIndex([row({ key: 'amazonservices', filings: 7, fein_count: 4 })]);
        expect(index.lookup('Amazon').filings).toBe(7);
    });
});


describe('buildH1bIndex — review fixes', () => {
    const lca = (o) => ({ CASE_STATUS: 'Certified', VISA_CLASS: 'H-1B', DECISION_DATE: '2026-03-15', ...o });

    it('resolves aliases written as real DOL spellings (Amazon.com Services LLC)', () => {
        const agg = createAggregator();
        agg.add(lca({ CASE_NUMBER: '1', EMPLOYER_NAME: 'Amazon.com Services LLC', EMPLOYER_FEIN: '10' }));
        agg.add(lca({ CASE_NUMBER: '2', EMPLOYER_NAME: 'Amazon.com Services LLC', EMPLOYER_FEIN: '11' }));
        agg.add(lca({ CASE_NUMBER: '3', EMPLOYER_NAME: 'Amazon Web Services, Inc.', EMPLOYER_FEIN: '12' }));
        const index = buildH1bIndex(agg.result(), { Amazon: ['Amazon.com Services LLC', 'Amazon Web Services, Inc.'] });
        expect(index.lookup('Amazon').filings).toBe(3);
    });

    it('uses only alias targets when a company has aliases (no unrelated same-name filer)', () => {
        const index = buildH1bIndex([
            row({ key: 'metaplatforms', filings: 500 }),
            row({ key: 'meta', filings: 3 }),
        ], { Meta: ['Meta Platforms, Inc.'] });
        expect(index.lookup('Meta').filings).toBe(500);
    });

    it('does not match a different company that only shares the first word', () => {
        const agg = createAggregator();
        agg.add(lca({ CASE_NUMBER: '1', EMPLOYER_NAME: 'FIGURE TECHNOLOGIES INC', EMPLOYER_FEIN: '20' }));
        expect(buildH1bIndex(agg.result(), {}).lookup('Figure AI')).toBe('none');
    });

    it('treats a key with no recorded FEIN as unverified', () => {
        expect(buildH1bIndex([row({ key: 'acme', fein_count: 0 })], {}).lookup('Acme')).toBe('none');
    });
});
