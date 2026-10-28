import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDirectory, isFreshJob } from './atsDirectory.js';

describe('parseDirectory', () => {
    it('keeps safe slugs and drops anything that could inject into a URL', () => {
        const out = parseDirectory('greenhouse', ['stripe', 'hudson-river-trading', '../etc', 'a/b', 'x?y=1', '', 42]);
        expect(out).toEqual(['stripe', 'hudson-river-trading']);
    });

    it('turns Workday "tenant|wdN|site" entries into career URLs', () => {
        const out = parseDirectory('workday', ['23andme|wd5|23', 'bad entry', 'evil|wd1|site/../x', 'nvidia|wd5|NvidiaExternalCareerSite']);
        expect(out).toEqual([
            { company: '23andme', careerUrl: 'https://23andme.wd5.myworkdayjobs.com/23' },
            { company: 'Nvidia', careerUrl: 'https://nvidia.wd5.myworkdayjobs.com/NvidiaExternalCareerSite' },
        ]);
    });
});

describe('isFreshJob', () => {
    const now = new Date('2026-10-28T00:00:00Z').getTime();

    it('keeps jobs posted within the window and drops older or undated ones', () => {
        expect(isFreshJob({ posted_at: '2026-10-20T00:00:00Z' }, 30, now)).toBe(true);
        expect(isFreshJob({ posted_at: '2026-08-01T00:00:00Z' }, 30, now)).toBe(false);
        expect(isFreshJob({ posted_at: null }, 30, now)).toBe(false);
    });

    it('never treats an estimated date as fresh (it is just "when we saw it")', () => {
        expect(isFreshJob({ posted_at: '2026-10-27T00:00:00Z', posted_at_estimated: true }, 30, now)).toBe(false);
    });
});

describe('fetchAtsDirectory', () => {
    beforeEach(() => vi.resetModules());
    afterEach(() => vi.unstubAllGlobals());

    it('loads every source and survives one dataset failing', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            const u = String(url);
            if (u.includes('greenhouse_companies')) return { ok: true, json: async () => ['stripe'] };
            if (u.includes('lever_companies')) return { ok: false, status: 503 };
            if (u.includes('ashby_companies')) return { ok: true, json: async () => ['linear'] };
            if (u.includes('workday_companies')) return { ok: true, json: async () => ['nvidia|wd5|Ext'] };
            return { ok: false, status: 404 };
        }));

        const { fetchAtsDirectory } = await import('./atsDirectory.js');
        const dir = await fetchAtsDirectory();

        expect(dir.greenhouse).toEqual(['stripe']);
        expect(dir.lever).toEqual([]);
        expect(dir.ashby).toEqual(['linear']);
        expect(dir.workday).toHaveLength(1);
    });
});
