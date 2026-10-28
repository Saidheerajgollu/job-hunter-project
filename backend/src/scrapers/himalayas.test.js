import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeHimalayas } from './himalayas.js';

vi.mock('../utils/helpers.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, sleep: vi.fn().mockResolvedValue(undefined) };
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function himalayasJob(overrides = {}) {
    return {
        title: 'Software Engineer',
        companyName: 'Acme',
        applicationLink: 'https://himalayas.app/companies/acme/jobs/software-engineer',
        guid: 'https://himalayas.app/companies/acme/jobs/software-engineer',
        locationRestrictions: ['United States'],
        seniority: ['Entry-level'],
        pubDate: 1793207097, // unix SECONDS — 2026-10-28
        excerpt: 'Build things',
        ...overrides,
    };
}

describe('scrapeHimalayas', () => {
    it('parses pubDate as unix seconds (not as milliseconds, which lands in 1970)', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => ({
            ok: true,
            json: async () => ({ jobs: String(url).includes('page=1') ? [himalayasJob()] : [] }),
        })));

        const jobs = await scrapeHimalayas(true);

        expect(jobs[0].posted_at).toBe('2026-10-28T17:04:57.000Z');
    });

    it('queries the US-filtered search endpoint newest-first instead of the 20-job browse feed', async () => {
        const urls = [];
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            urls.push(String(url));
            return { ok: true, json: async () => ({ jobs: [] }) };
        }));

        await scrapeHimalayas(true);

        expect(urls.length).toBeGreaterThan(1);
        for (const u of urls) {
            expect(u).toContain('/jobs/api/search');
            expect(u).toContain('country=US');
            expect(u).toContain('sort=recent');
        }
    });

    it('dedupes the same job returned by two different search terms', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => ({
            ok: true,
            json: async () => ({ jobs: String(url).includes('page=1') ? [himalayasJob()] : [] }),
        })));

        const jobs = await scrapeHimalayas(true);

        expect(jobs).toHaveLength(1);
    });
});
