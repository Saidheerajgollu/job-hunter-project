import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeLever } from './lever.js';

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

describe('scrapeLever', () => {
    it('includes a company in polledCompanies when its fetch succeeds, using the formatted company name', async () => {
        mockFetch(async (url) => {
            if (String(url).includes('test-co')) {
                return {
                    ok: true,
                    json: async () => ([{
                        id: 'abc', text: 'Backend Engineer',
                        hostedUrl: 'https://jobs.lever.co/test-co/abc',
                        categories: { location: 'Remote' }, createdAt: 1735689600000,
                    }]),
                };
            }
            return { ok: true, json: async () => ([]) };
        });

        const { jobs, polledCompanies } = await scrapeLever(true, ['test-co']);

        expect(polledCompanies).toContain('Test Co');
        expect(jobs[0].company).toBe('Test Co');
    });

    it('excludes a company from polledCompanies when its fetch returns a non-OK response', async () => {
        mockFetch(async () => ({ ok: false, status: 500 }));

        const { polledCompanies } = await scrapeLever(true, ['broken']);

        expect(polledCompanies).not.toContain('Broken');
    });

    it('excludes a company from polledCompanies when the response body is not an array', async () => {
        mockFetch(async () => ({ ok: true, json: async () => ({ not: 'an array' }) }));

        const { polledCompanies } = await scrapeLever(true, ['weird']);

        expect(polledCompanies).not.toContain('Weird');
    });

    it('still includes a company in polledCompanies even when it has zero matching jobs this run', async () => {
        mockFetch(async () => ({ ok: true, json: async () => ([]) }));

        const { jobs, polledCompanies } = await scrapeLever(true, ['quiet-co']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('Quiet Co');
    });

    it('does not send the exact-match commitment=fulltime filter (Lever stores "Full-time", so it matched nothing)', async () => {
        const urls = [];
        mockFetch(async (url) => {
            urls.push(String(url));
            return { ok: true, json: async () => ([]) };
        });

        await scrapeLever(true, ['palantir']);

        expect(urls.length).toBeGreaterThan(0);
        expect(urls.every(u => !u.includes('commitment='))).toBe(true);
    });

    it('keeps full-time roles, skips internships, but records every posting in seenUrls', async () => {
        mockFetch(async (url) => {
            if (!String(url).includes('/acme?')) return { ok: true, json: async () => ([]) };
            return {
                ok: true,
                json: async () => ([
                    { id: 'a', text: 'Software Engineer', hostedUrl: 'https://jobs.lever.co/acme/a', categories: { commitment: 'Full-time', location: 'Austin, TX' }, createdAt: 1786469891368 },
                    { id: 'b', text: 'Software Engineer Intern', hostedUrl: 'https://jobs.lever.co/acme/b', categories: { commitment: 'Internship', location: 'Austin, TX' }, createdAt: 1786469891368 },
                ]),
            };
        });

        const { jobs, seenUrls } = await scrapeLever(true, ['acme']);

        expect(jobs.map(j => j.url)).toEqual(['https://jobs.lever.co/acme/a']);
        expect(seenUrls).toEqual(expect.arrayContaining(['https://jobs.lever.co/acme/a', 'https://jobs.lever.co/acme/b']));
    });
});
