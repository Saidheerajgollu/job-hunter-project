import { describe, it, expect } from 'vitest';
import { computeStaleUpdates, isRelistRepost } from './staleness.js';

describe('computeStaleUpdates', () => {
    it('leaves a job alone when its URL is in freshUrls', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 0 }];
        const fresh = new Set(['https://x/a']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh);

        expect(toIncrement).toEqual([]);
        expect(toClose).toEqual([]);
    });

    it('increments a missing job that has not yet hit the threshold', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 0 }];
        const fresh = new Set(['https://x/b']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toIncrement).toEqual(['a']);
        expect(toClose).toEqual([]);
    });

    it('closes a missing job once missed_count + 1 reaches the threshold', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 1 }];
        const fresh = new Set(['https://x/b']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toIncrement).toEqual([]);
        expect(toClose).toEqual(['a']);
    });

    it('closes a missing job that is already past the threshold', () => {
        const existing = [{ id: 'a', url: 'https://x/a', missed_count: 5 }];
        const fresh = new Set(['https://x/b']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toClose).toEqual(['a']);
    });

    it('handles a mix of seen, incrementing, and closing jobs in one call', () => {
        const existing = [
            { id: 'seen', url: 'https://x/seen', missed_count: 0 },
            { id: 'first-miss', url: 'https://x/first-miss', missed_count: 0 },
            { id: 'second-miss', url: 'https://x/second-miss', missed_count: 1 },
        ];
        const fresh = new Set(['https://x/seen']);

        const { toIncrement, toClose } = computeStaleUpdates(existing, fresh, 2);

        expect(toIncrement).toEqual(['first-miss']);
        expect(toClose).toEqual(['second-miss']);
    });

    it('returns empty arrays when there are no existing open jobs', () => {
        const { toIncrement, toClose } = computeStaleUpdates([], new Set(['https://x/a']));
        expect(toIncrement).toEqual([]);
        expect(toClose).toEqual([]);
    });
});


describe('isRelistRepost', () => {
    const now = new Date('2026-10-28T20:00:00Z').getTime();
    const daysAgo = d => new Date(now - d * 86400000).toISOString();

    it('flags a listing that was closed and comes back after 7+ days', () => {
        expect(isRelistRepost({ closed_at: daysAgo(3), scraped_at: daysAgo(10) }, now)).toBe(true);
    });

    it('does not flag an open listing that simply was not checked for a while (e.g. a scraper outage)', () => {
        expect(isRelistRepost({ closed_at: null, scraped_at: daysAgo(56) }, now)).toBe(false);
    });

    it('does not flag a listing closed only briefly (back within 7 days)', () => {
        expect(isRelistRepost({ closed_at: daysAgo(1), scraped_at: daysAgo(2) }, now)).toBe(false);
    });
});
