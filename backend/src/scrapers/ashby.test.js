import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeAshby } from './ashby.js';

function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('scrapeAshby', () => {
    it('includes a company in polledCompanies when its fetch succeeds', async () => {
        mockFetch(async (url) => {
            if (String(url).includes('anyscale')) {
                return {
                    ok: true,
                    json: async () => ({
                        jobs: [{
                            id: 'j1', title: 'ML Engineer', isListed: true,
                            jobUrl: 'https://jobs.ashbyhq.com/anyscale/j1',
                            publishedAt: '2026-01-01T00:00:00.000Z',
                        }],
                    }),
                };
            }
            return { ok: false, status: 404 };
        });

        const { jobs, polledCompanies } = await scrapeAshby(true, []);

        expect(polledCompanies).toContain('Anyscale');
        expect(jobs.some(j => j.company === 'Anyscale')).toBe(true);
    });

    it('excludes a company from polledCompanies when its fetch fails', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { polledCompanies } = await scrapeAshby(true, ['brand-new-co']);

        expect(polledCompanies).not.toContain('brand-new-co');
    });

    it('still includes a company in polledCompanies with zero matching jobs this run', async () => {
        mockFetch(async (url) => (String(url).includes('quietco')
            ? { ok: true, json: async () => ({ jobs: [] }) }
            : { ok: false, status: 404 }));

        const { jobs, polledCompanies } = await scrapeAshby(true, ['quietco']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('quietco');
    });
});
