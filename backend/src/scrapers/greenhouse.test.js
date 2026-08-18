import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeGreenhouse } from './greenhouse.js';

function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('scrapeGreenhouse', () => {
    it('includes a company in polledCompanies when its fetch succeeds, using the formatted company name', async () => {
        mockFetch(async () => ({
            ok: true,
            json: async () => ({
                jobs: [{
                    id: 1, title: 'Software Engineer',
                    absolute_url: 'https://boards.greenhouse.io/testco/jobs/1',
                    location: { name: 'Remote' }, updated_at: '2026-01-01T00:00:00.000Z',
                }],
            }),
        }));

        const { jobs, polledCompanies } = await scrapeGreenhouse(true, ['testco']);

        expect(polledCompanies).toContain('Testco');
        expect(jobs[0].company).toBe('Testco');
    });

    it('excludes a company from polledCompanies when its fetch returns a non-OK response', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { jobs, polledCompanies } = await scrapeGreenhouse(true, ['broken']);

        expect(polledCompanies).not.toContain('Broken');
        expect(jobs).toEqual([]);
    });

    it('excludes a company from polledCompanies when its fetch throws', async () => {
        mockFetch(async () => { throw new Error('network error'); });

        const { polledCompanies } = await scrapeGreenhouse(true, ['broken']);

        expect(polledCompanies).not.toContain('Broken');
    });

    it('still includes a company in polledCompanies even when it has zero matching jobs this run', async () => {
        mockFetch(async () => ({ ok: true, json: async () => ({ jobs: [] }) }));

        const { jobs, polledCompanies } = await scrapeGreenhouse(true, ['quietco']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('Quietco');
    });
});
