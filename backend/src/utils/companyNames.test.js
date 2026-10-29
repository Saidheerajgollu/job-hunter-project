import { describe, it, expect } from 'vitest';
import { normalizeCompanyName, buildCompanyIndex, companyNameKeys, normalizeLegalName, legalNameKeys } from './companyNames.js';

describe('normalizeCompanyName', () => {
    it('ignores case, punctuation and common corporate suffixes', () => {
        expect(normalizeCompanyName('Expedia Group')).toBe('expedia');
        expect(normalizeCompanyName('Rover.com')).toBe('rover');
        expect(normalizeCompanyName('Stripe, Inc.')).toBe('stripe');
        expect(normalizeCompanyName('Perplexity AI')).toBe('perplexity');
        expect(normalizeCompanyName('dbt Labs')).toBe('dbtlabs');
        expect(normalizeCompanyName('AT&T')).toBe('atandt');
    });

    it('keeps names that are only a suffix word from collapsing to empty', () => {
        expect(normalizeCompanyName('Group')).toBe('group');
    });
});

describe('buildCompanyIndex', () => {
    it('maps a watched name to every raw company spelling in the feed', () => {
        const index = buildCompanyIndex(['Expedia', 'Expedia Group', 'Expedia, Inc.', 'Stripe']);
        expect(index.get(normalizeCompanyName('Expedia Group')).sort()).toEqual(['Expedia', 'Expedia Group', 'Expedia, Inc.']);
        expect(index.get('stripe')).toEqual(['Stripe']);
    });
});

describe('companyNameKeys', () => {
    it('also tries each "A / B" alternative and a parenthetical alias', () => {
        expect(companyNameKeys('Google / Alphabet')).toEqual(['googlealphabet', 'google', 'alphabet']);
        expect(companyNameKeys('Auth0 (Okta)')).toEqual(['auth0', 'okta']);
        expect(companyNameKeys('Stripe')).toEqual(['stripe']);
    });
});


describe('normalizeLegalName (strict, for H-1B matching)', () => {
    it('strips only legal-form suffixes, so different companies stay different', () => {
        expect(normalizeLegalName('Figure AI')).not.toBe(normalizeLegalName('Figure Technologies Inc'));
        expect(normalizeLegalName('Ramp')).not.toBe(normalizeLegalName('The Ramp Group'));
    });

    it('still matches the same company across spellings of its legal form', () => {
        expect(normalizeLegalName('STRIPE INC')).toBe(normalizeLegalName('Stripe'));
        expect(normalizeLegalName('Stripe, Inc.')).toBe('stripe');
        expect(normalizeLegalName('PERPLEXITY AI INC')).toBe(normalizeLegalName('Perplexity AI'));
        expect(normalizeLegalName('JPMorgan Chase & Co.')).toBe('jpmorganchaseand');
    });

    it('legalNameKeys tries "A / B" parts and a parenthetical alias', () => {
        expect(legalNameKeys('Google / Alphabet')).toEqual(['googlealphabet', 'google', 'alphabet']);
    });
});
