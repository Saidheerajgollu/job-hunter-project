import { describe, it, expect } from 'vitest';
import { buildJobQueryFilters, usEligibilityCondition } from './roleFilters.js';
import { getUsLocationPgRegex } from './helpers.js';

describe('buildJobQueryFilters — closed job visibility', () => {
    it('excludes closed jobs from the feed for everyone (the board is shared, no per-user status)', () => {
        const { where } = buildJobQueryFilters({});

        expect(where).toContain('closed_at IS NULL');
        expect(where).not.toContain('status');
    });

    it('still includes the closed-job condition alongside other filters', () => {
        const { where, params } = buildJobQueryFilters({ role: 'swe' });

        expect(where).toContain('closed_at IS NULL');
        expect(params.length).toBeGreaterThan(0); // role filter still added its own params
    });
});

describe('US-only filter', () => {
    it('uses the stored us_ineligible flag instead of re-running regex/ILIKE on every row', () => {
        const { where } = buildJobQueryFilters({ us_only: true });

        expect(where).toContain('us_ineligible IS NOT TRUE');
        expect(where).not.toMatch(/ILIKE|~\*/);
    });

    it('usEligibilityCondition (used once to backfill old rows) lets a US signal override a non-US match', () => {
        const params = [];
        const sql = usEligibilityCondition(params);

        const usIdx = params.indexOf(getUsLocationPgRegex()) + 1;
        expect(usIdx).toBeGreaterThan(0);
        expect(sql).toContain(`COALESCE(location, '') ~* $${usIdx}`);
        expect(sql).toContain('NOT ILIKE');
    });
});

describe('hide_no_sponsorship filter', () => {
    it('excludes jobs whose posting says no sponsorship (keeps unknown ones)', () => {
        expect(buildJobQueryFilters({ hide_no_sponsorship: true }).where).toContain("visa_wording IS DISTINCT FROM 'no_sponsorship'");
    });

    it('adds nothing when the flag is off', () => {
        expect(buildJobQueryFilters({}).where).not.toContain('visa_wording');
    });
});
