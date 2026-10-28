import { describe, it, expect } from 'vitest';
import { toIsoDate, parseWorkdayPostedOn, mapWithConcurrency, isSeniorRole } from './helpers.js';

describe('toIsoDate', () => {
    it('treats a 10-digit number as unix seconds, not milliseconds', () => {
        expect(toIsoDate(1793207097)).toBe('2026-10-28T17:04:57.000Z');
    });

    it('treats a numeric string of unix seconds the same way', () => {
        expect(toIsoDate('1793207097')).toBe('2026-10-28T17:04:57.000Z');
    });

    it('keeps millisecond timestamps as milliseconds', () => {
        expect(toIsoDate(1793207097000)).toBe('2026-10-28T17:04:57.000Z');
    });

    it('parses ISO strings with offsets', () => {
        expect(toIsoDate('2026-09-09T10:50:29-04:00')).toBe('2026-09-09T14:50:29.000Z');
    });

    it('returns the fallback for missing or unparseable input instead of throwing', () => {
        expect(toIsoDate(undefined, 'FALLBACK')).toBe('FALLBACK');
        expect(toIsoDate('not a date', 'FALLBACK')).toBe('FALLBACK');
    });
});

describe('parseWorkdayPostedOn', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');

    it('parses "Posted Today"', () => {
        expect(parseWorkdayPostedOn('Posted Today', now)).toBe('2026-10-28T12:00:00.000Z');
    });

    it('parses "Posted Yesterday"', () => {
        expect(parseWorkdayPostedOn('Posted Yesterday', now)).toBe('2026-10-27T12:00:00.000Z');
    });

    it('parses "Posted 10 Days Ago"', () => {
        expect(parseWorkdayPostedOn('Posted 10 Days Ago', now)).toBe('2026-10-18T12:00:00.000Z');
    });

    it('parses "Posted 30+ Days Ago" as 30 days', () => {
        expect(parseWorkdayPostedOn('Posted 30+ Days Ago', now)).toBe('2026-09-28T12:00:00.000Z');
    });

    it('returns null for unknown text so callers never invent a fresh date', () => {
        expect(parseWorkdayPostedOn('', now)).toBeNull();
        expect(parseWorkdayPostedOn(undefined, now)).toBeNull();
    });
});

describe('mapWithConcurrency', () => {
    it('preserves input order in the results', async () => {
        const out = await mapWithConcurrency([30, 10, 20], 2, async (ms) => {
            await new Promise(r => setTimeout(r, ms));
            return ms;
        });
        expect(out).toEqual([30, 10, 20]);
    });

    it('never runs more than `limit` tasks at once', async () => {
        let active = 0;
        let peak = 0;
        await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise(r => setTimeout(r, 5));
            active--;
        });
        expect(peak).toBe(3);
    });

    it('captures a rejected task as an Error in its slot without stopping the others', async () => {
        const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
            if (n === 2) throw new Error('boom');
            return n * 10;
        });
        expect(out[0]).toBe(10);
        expect(out[1]).toBeInstanceOf(Error);
        expect(out[2]).toBe(30);
    });
});

describe('isWorkdayPostedOnCapped', () => {
    it('flags open-ended "30+ Days Ago" as an estimate, but not exact day counts', async () => {
        const { isWorkdayPostedOnCapped } = await import('./helpers.js');
        expect(isWorkdayPostedOnCapped('Posted 30+ Days Ago')).toBe(true);
        expect(isWorkdayPostedOnCapped('Posted 10 Days Ago')).toBe(false);
        expect(isWorkdayPostedOnCapped('Posted Today')).toBe(false);
    });
});

describe('isUsEligible', () => {
    it('combines the US-location and citizenship checks (stored per job as us_ineligible)', async () => {
        const { isUsEligible } = await import('./helpers.js');
        expect(isUsEligible({ title: 'Software Engineer', location: 'Austin, TX' })).toBe(true);
        expect(isUsEligible({ title: 'Software Engineer', location: 'Berlin, Germany' })).toBe(false);
        expect(isUsEligible({ title: 'Software Engineer', location: 'Austin, TX', description: 'Must be a U.S. citizen' })).toBe(false);
    });
});

describe('isSeniorRole', () => {
    it('catches the "Sr." / "Sr" abbreviation', () => {
        expect(isSeniorRole('Sr. Software Engineer')).toBe(true);
        expect(isSeniorRole('Sr Data Engineer')).toBe(true);
    });

    it('does not flag words that merely start with "sr"', () => {
        expect(isSeniorRole('SRE I')).toBe(false);
        expect(isSeniorRole('Software Engineer')).toBe(false);
    });
});

describe('US location signal (shared by isUSCompatible and the feed SQL filter)', () => {
    it('keeps multi-location roles that include a US office alongside a non-US one', async () => {
        const { isUSCompatible } = await import('./helpers.js');
        expect(isUSCompatible('San Francisco | London')).toBe(true);
        expect(isUSCompatible('New York; Toronto')).toBe(true);
        expect(isUSCompatible('Remote (US) or Canada')).toBe(true);
    });

    it('still rejects purely non-US locations', async () => {
        const { isUSCompatible } = await import('./helpers.js');
        expect(isUSCompatible('London, UK')).toBe(false);
        expect(isUSCompatible('Berlin, Germany')).toBe(false);
        expect(isUSCompatible('Bangalore')).toBe(false);
        // Country codes that are also US state codes must not rescue them.
        expect(isUSCompatible('Bengaluru, IN')).toBe(false);
        expect(isUSCompatible('Berlin, DE')).toBe(false);
        expect(isUSCompatible('Tel Aviv, IL')).toBe(false);
    });

});
