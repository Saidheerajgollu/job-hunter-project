import { describe, it, expect } from 'vitest';
import { buildJobQueryFilters } from './roleFilters.js';

describe('buildJobQueryFilters — closed job visibility', () => {
    it('excludes closed jobs from the default query unless they are saved or applied', () => {
        const { where } = buildJobQueryFilters({});

        expect(where).toContain(`(closed_at IS NULL OR status IN ('saved', 'applied'))`);
    });

    it('still includes the closed-job condition alongside other filters', () => {
        const { where, params } = buildJobQueryFilters({ role: 'swe' });

        expect(where).toContain(`(closed_at IS NULL OR status IN ('saved', 'applied'))`);
        expect(params.length).toBeGreaterThan(0); // role filter still added its own params
    });
});
