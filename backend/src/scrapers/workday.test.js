import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeWorkday } from './workday.js';

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

describe('scrapeWorkday', () => {
    it('includes a company in polledCompanies when at least one search term succeeds', async () => {
        mockFetch(async (url) => {
            if (String(url).includes('salesforce.wd12')) {
                return {
                    ok: true,
                    json: async () => ({
                        jobPostings: [{
                            title: 'Software Engineer',
                            externalPath: '/job/123',
                            locationsText: 'San Francisco, CA',
                        }],
                    }),
                };
            }
            return { ok: false, status: 500 };
        });

        const { jobs, polledCompanies } = await scrapeWorkday(true);

        expect(polledCompanies).toContain('Salesforce');
        expect(jobs.some(j => j.company === 'Salesforce')).toBe(true);
    });

    it('excludes a company from polledCompanies when every request fails', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { jobs, polledCompanies } = await scrapeWorkday(true);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toEqual([]);
    });

    it('excludes a company when all search terms succeed but find zero jobs', async () => {
        mockFetch(async () => ({ ok: true, json: async () => ({ jobPostings: [] }) }));

        const { jobs, polledCompanies } = await scrapeWorkday(true);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toEqual([]);
    });
});
