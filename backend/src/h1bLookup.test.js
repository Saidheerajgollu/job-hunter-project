import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({ getH1bEmployers: vi.fn() }));
vi.mock('./db.js', () => db);

const row = (o) => ({ display_name: 'X', filings: 1, last_decision_date: '2026-03-01', fein_count: 1, min_fy: 2026, max_fy: 2026, ...o });

describe('h1bLookup', () => {
    beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); db.getH1bEmployers.mockReset(); });
    afterEach(() => vi.useRealTimers());

    it('attaches a summary or "none" to each job', async () => {
        db.getH1bEmployers.mockResolvedValue([row({ key: 'stripe', filings: 40 })]);
        const { getH1bIndex, attachH1b } = await import('./h1bLookup.js');
        const jobs = attachH1b([{ company: 'Stripe' }, { company: 'Nobody Inc' }], await getH1bIndex());
        expect(jobs[0].h1b).toMatchObject({ filings: 40 });
        expect(jobs[1].h1b).toBe('none');
    });

    it('attaches null to every job when no H-1B data was imported', async () => {
        db.getH1bEmployers.mockResolvedValue([]);
        const { getH1bIndex, attachH1b } = await import('./h1bLookup.js');
        expect(attachH1b([{ company: 'Stripe' }], await getH1bIndex())[0].h1b).toBeNull();
    });

    it('lists only feed companies with a matched H-1B record', async () => {
        db.getH1bEmployers.mockResolvedValue([row({ key: 'stripe' }), row({ key: 'box', fein_count: 3 })]);
        const { getH1bIndex, h1bCompanyNames } = await import('./h1bLookup.js');
        expect(h1bCompanyNames(await getH1bIndex(), ['Stripe', 'Box', 'Nobody'])).toEqual(['Stripe']);
    });

    it('reloads from the database at most every 10 minutes', async () => {
        db.getH1bEmployers.mockResolvedValue([]);
        const { getH1bIndex } = await import('./h1bLookup.js');
        await getH1bIndex(); await getH1bIndex();
        expect(db.getH1bEmployers).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(10 * 60 * 1000 + 1);
        await getH1bIndex();
        expect(db.getH1bEmployers).toHaveBeenCalledTimes(2);
    });
});
