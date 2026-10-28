import { describe, it, expect } from 'vitest';
import { normalizeCompanyName, buildCompanyIndex, companyNameKeys } from './companyNames.js';

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
