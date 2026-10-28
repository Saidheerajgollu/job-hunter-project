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

    it('never asks Workday for more than 20 postings per request (the CXS API 400s above that)', async () => {
        const bodies = [];
        mockFetch(async (url, init) => {
            bodies.push(JSON.parse(init.body));
            return { ok: true, json: async () => ({ jobPostings: [] }) };
        });

        await scrapeWorkday(true);

        expect(bodies.length).toBeGreaterThan(0);
        expect(Math.max(...bodies.map(b => b.limit))).toBeLessThanOrEqual(20);
    });

    it('pages past the first 20 results when a page comes back full', async () => {
        const offsets = [];
        mockFetch(async (url, init) => {
            if (!String(url).includes('nvidia.wd5')) return { ok: true, json: async () => ({ jobPostings: [] }) };
            const { offset, searchText } = JSON.parse(init.body);
            if (searchText !== 'software engineer') return { ok: true, json: async () => ({ jobPostings: [] }) };
            offsets.push(offset);
            const count = offset === 0 ? 20 : 5;
            return {
                ok: true,
                json: async () => ({
                    jobPostings: Array.from({ length: count }, (_, i) => ({
                        title: 'Software Engineer', externalPath: `/job/${offset + i}`,
                        locationsText: 'Santa Clara, CA', postedOn: 'Posted Today',
                    })),
                }),
            };
        });

        const { jobs } = await scrapeWorkday(true);

        expect(offsets).toEqual([0, 20]);
        expect(jobs.filter(j => j.company === 'Nvidia')).toHaveLength(25);
    });

    it('uses the posting\'s own postedOn date instead of stamping now() on every poll', async () => {
        mockFetch(async (url) => {
            if (!String(url).includes('salesforce.wd12')) return { ok: true, json: async () => ({ jobPostings: [] }) };
            return {
                ok: true,
                json: async () => ({
                    jobPostings: [{
                        title: 'Software Engineer', externalPath: '/job/9',
                        locationsText: 'Seattle, WA', postedOn: 'Posted 10 Days Ago',
                    }],
                }),
            };
        });

        const { jobs } = await scrapeWorkday(true);
        const ageDays = (Date.now() - new Date(jobs[0].posted_at).getTime()) / 86400000;

        expect(Math.round(ageDays)).toBe(10);
    });

    it('also polls Workday tenants discovered at runtime', async () => {
        mockFetch(async (url) => {
            if (!String(url).includes('generalmotors.wd5')) return { ok: true, json: async () => ({ jobPostings: [] }) };
            return {
                ok: true,
                json: async () => ({
                    jobPostings: [{ title: 'Software Engineer', externalPath: '/job/gm1', locationsText: 'Austin, TX', postedOn: 'Posted Today' }],
                }),
            };
        });

        const { jobs, polledCompanies } = await scrapeWorkday(true, [
            { company: 'Generalmotors', careerUrl: 'https://generalmotors.wd5.myworkdayjobs.com/Careers_GM' },
        ]);

        expect(polledCompanies).toContain('Generalmotors');
        expect(jobs[0].url).toBe('https://generalmotors.wd5.myworkdayjobs.com/Careers_GM/job/gm1');
    });
});
