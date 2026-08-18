import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSmartRecruiters } from '../watchers/atsFetchers.js';
import { scrapeSmartRecruiters } from './smartrecruiters.js';

vi.mock('../watchers/atsFetchers.js', () => ({
    fetchSmartRecruiters: vi.fn(),
}));

function mockPostingsFor(slug, postings) {
    vi.mocked(fetchSmartRecruiters).mockImplementation(async (s) => (s === slug ? postings : []));
}

describe('scrapeSmartRecruiters', () => {
    beforeEach(() => {
        vi.mocked(fetchSmartRecruiters).mockReset();
        vi.mocked(fetchSmartRecruiters).mockResolvedValue([]);
    });

    it('classifies and maps raw postings into job records, using the slug as company name for discovered companies', async () => {
        mockPostingsFor('testco', [{
            id: 'abc123',
            title: 'Software Engineer',
            url: 'https://jobs.smartrecruiters.com/testco/abc123',
            location: 'Austin, TX',
            posted_at: '2026-01-01T00:00:00.000Z',
            source: 'smartrecruiters',
        }]);

        const jobs = await scrapeSmartRecruiters(true, ['testco']);

        expect(jobs).toContainEqual({
            id: 'abc123',
            title: 'Software Engineer',
            company: 'testco',
            location: 'Austin, TX',
            url: 'https://jobs.smartrecruiters.com/testco/abc123',
            source: 'smartrecruiters',
            category: 'swe',
            salary: null,
            description: null,
            posted_at: '2026-01-01T00:00:00.000Z',
        });
    });

    it('filters out senior roles when filterSenior is true', async () => {
        mockPostingsFor('testco', [{
            id: 'sr1', title: 'Senior Software Engineer', url: 'https://x', location: 'US',
            posted_at: 'now', source: 'smartrecruiters',
        }]);

        const jobs = await scrapeSmartRecruiters(true, ['testco']);
        expect(jobs).toHaveLength(0);
    });

    it('skips postings that are not tech roles', async () => {
        mockPostingsFor('testco', [{
            id: 'nc1', title: 'Sales Account Executive', url: 'https://x', location: 'US',
            posted_at: 'now', source: 'smartrecruiters',
        }]);

        const jobs = await scrapeSmartRecruiters(true, ['testco']);
        expect(jobs).toHaveLength(0);
    });

    it('does not fetch a discovered slug twice when it differs only in case from a seed company', async () => {
        const calls = [];
        vi.mocked(fetchSmartRecruiters).mockImplementation(async (s) => {
            calls.push(s);
            return [];
        });

        // 'Visa' is already a hardcoded seed company; 'visa' is a case-variant
        // a discovery pass could surface from a differently-cased listing URL.
        await scrapeSmartRecruiters(true, ['visa']);

        const visaCalls = calls.filter(s => s.toLowerCase() === 'visa');
        expect(visaCalls).toHaveLength(1);
        expect(visaCalls[0]).toBe('Visa');
    });

    it('continues past a company whose fetch throws', async () => {
        vi.mocked(fetchSmartRecruiters).mockImplementation(async (s) => {
            if (s === 'broken') throw new Error('SmartRecruiters HTTP 500');
            if (s === 'testco') {
                return [{
                    id: 'ok1', title: 'Backend Engineer', url: 'https://x', location: 'US',
                    posted_at: 'now', source: 'smartrecruiters',
                }];
            }
            return [];
        });

        const jobs = await scrapeSmartRecruiters(true, ['broken', 'testco']);

        expect(jobs).toHaveLength(1);
        expect(jobs[0].id).toBe('ok1');
    });
});
