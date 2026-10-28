import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeGreenhouse } from './greenhouse.js';

vi.mock('../utils/helpers.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, sleep: vi.fn().mockResolvedValue(undefined) };
});

function mockFetch(handler) {
    vi.stubGlobal('fetch', vi.fn(handler));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('scrapeGreenhouse', () => {
    it('includes a company in polledCompanies when its fetch succeeds, using the formatted company name', async () => {
        mockFetch(async (url) => {
            if (String(url).includes('testco')) {
                return {
                    ok: true,
                    json: async () => ({
                        jobs: [{
                            id: 1, title: 'Software Engineer',
                            absolute_url: 'https://boards.greenhouse.io/testco/jobs/1',
                            location: { name: 'Remote' }, updated_at: '2026-01-01T00:00:00.000Z',
                        }],
                    }),
                };
            }
            return { ok: true, json: async () => ({ jobs: [] }) };
        });

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

    it('uses the board\'s real company_name and first_published date when Greenhouse provides them', async () => {
        mockFetch(async (url) => {
            if (!String(url).includes('/hudson-river-trading/')) return { ok: true, json: async () => ({ jobs: [] }) };
            return {
                ok: true,
                json: async () => ({
                    jobs: [{
                        id: 7, title: 'Software Engineer', company_name: 'Hudson River Trading',
                        absolute_url: 'https://www.hudsonrivertrading.com/careers/job/?gh_jid=7',
                        location: { name: 'New York, NY' },
                        first_published: '2026-09-09T10:50:29-04:00',
                        updated_at: '2026-10-22T09:17:09-04:00',
                    }],
                }),
            };
        });

        const { jobs, polledCompanies } = await scrapeGreenhouse(true, ['hudson-river-trading']);
        const job = jobs.find(j => j.url.includes('gh_jid=7'));

        expect(job.company).toBe('Hudson River Trading');
        // An edit (updated_at) must not masquerade as the posting date / a repost.
        expect(job.posted_at).toBe('2026-09-09T14:50:29.000Z');
        // Both the real name and the legacy slug-derived name count as polled, so
        // rows stored under the old name are still eligible for the closer sweep.
        expect(polledCompanies).toContain('Hudson River Trading');
        expect(polledCompanies).toContain('Hudson-river-trading');
    });
});
