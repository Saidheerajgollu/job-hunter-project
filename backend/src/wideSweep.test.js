import { describe, it, expect, vi } from 'vitest';

vi.mock('./db.js', () => ({ getAllSettings: vi.fn(), insertJob: vi.fn(), closeStaleJobs: vi.fn() }));

const { selectWideCompanies, prepareWideResult } = await import('./wideSweep.js');
const { emptyDiscovery } = await import('./utils/discoverCompanies.js');

describe('selectWideCompanies', () => {
    it('skips boards the fast poll already covers (seed lists and SimplifyJobs discovery)', () => {
        const directory = {
            greenhouse: ['stripe', 'tinyco'],
            lever: ['palantir', 'smallco'],
            ashby: ['linear', 'newco'],
            workday: [
                { company: 'nvidia', careerUrl: 'https://nvidia.wd5.myworkdayjobs.com/NvidiaExternalCareerSite' },
                { company: 'acme', careerUrl: 'https://acme.wd1.myworkdayjobs.com/Ext' },
            ],
        };
        const discovered = { ...emptyDiscovery(), lever: ['palantir'] };

        const wide = selectWideCompanies(directory, discovered);

        expect(wide.greenhouse).toEqual(['tinyco']);
        expect(wide.lever).toEqual(['smallco']);
        expect(wide.ashby).toEqual(['newco']);
        expect(wide.workday.map(c => c.company)).toEqual(['acme']);
    });
});

describe('prepareWideResult', () => {
    const now = new Date('2026-10-28T00:00:00Z').getTime();

    it('drops boards whose company name the fast poll also uses, so its closer cannot close them', () => {
        const result = {
            jobs: [
                { company: 'Stripe', url: 'a', posted_at: '2026-10-25T00:00:00Z' },
                { company: 'Tinyco', url: 'b', posted_at: '2026-10-25T00:00:00Z' },
            ],
            polledCompanies: ['Stripe', 'Tinyco'],
            seenUrls: ['a', 'b'],
        };

        const out = prepareWideResult(result, new Set(['Stripe']), 30, now);

        expect(out.jobs.map(j => j.company)).toEqual(['Tinyco']);
        expect(out.polledCompanies).toEqual(['Tinyco']);
    });

    it('keeps only postings inside the age window', () => {
        const out = prepareWideResult({
            jobs: [
                { company: 'A', url: 'new', posted_at: '2026-10-20T00:00:00Z' },
                { company: 'A', url: 'old', posted_at: '2025-01-01T00:00:00Z' },
            ],
            polledCompanies: ['A'], seenUrls: ['new', 'old'],
        }, new Set(), 30, now);

        expect(out.jobs.map(j => j.url)).toEqual(['new']);
        // Every posting still counts as seen, so old-but-open jobs are never closed.
        expect(out.seenUrls).toEqual(['new', 'old']);
    });
});
