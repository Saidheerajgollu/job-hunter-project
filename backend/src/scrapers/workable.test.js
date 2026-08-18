import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWorkable } from '../watchers/atsFetchers.js';
import { scrapeWorkable } from './workable.js';

vi.mock('../watchers/atsFetchers.js', () => ({
    fetchWorkable: vi.fn(),
}));

function mockPostingsFor(slug, postings) {
    vi.mocked(fetchWorkable).mockImplementation(async (s) => (s === slug ? postings : []));
}

describe('scrapeWorkable', () => {
    beforeEach(() => {
        vi.mocked(fetchWorkable).mockReset();
        vi.mocked(fetchWorkable).mockResolvedValue([]);
    });

    it('classifies and maps raw postings into job records, using the slug as company name for discovered companies', async () => {
        mockPostingsFor('testco', [{
            id: 'abc123',
            title: 'Frontend Engineer',
            url: 'https://apply.workable.com/testco/j/ABC123/',
            location: 'Remote',
            posted_at: '2026-01-01T00:00:00.000Z',
            source: 'workable',
        }]);

        const { jobs } = await scrapeWorkable(true, ['testco']);

        expect(jobs).toContainEqual({
            id: 'abc123',
            title: 'Frontend Engineer',
            company: 'testco',
            location: 'Remote',
            url: 'https://apply.workable.com/testco/j/ABC123/',
            source: 'workable',
            category: 'frontend',
            salary: null,
            description: null,
            posted_at: '2026-01-01T00:00:00.000Z',
        });
    });

    it('filters out senior roles when filterSenior is true', async () => {
        mockPostingsFor('testco', [{
            id: 'sr1', title: 'Senior Backend Engineer', url: 'https://x', location: 'US',
            posted_at: 'now', source: 'workable',
        }]);

        const { jobs } = await scrapeWorkable(true, ['testco']);
        expect(jobs).toHaveLength(0);
    });

    it('skips postings that are not tech roles', async () => {
        mockPostingsFor('testco', [{
            id: 'nc1', title: 'Office Manager', url: 'https://x', location: 'US',
            posted_at: 'now', source: 'workable',
        }]);

        const { jobs } = await scrapeWorkable(true, ['testco']);
        expect(jobs).toHaveLength(0);
    });

    it('does not fetch a discovered slug twice when it differs only in case from a seed company', async () => {
        const calls = [];
        vi.mocked(fetchWorkable).mockImplementation(async (s) => {
            calls.push(s);
            return [];
        });

        // 'salesloft' is already a hardcoded seed company; 'Salesloft' is a
        // case-variant a discovery pass could surface from a listing URL.
        const { } = await scrapeWorkable(true, ['Salesloft']);

        const matches = calls.filter(s => s.toLowerCase() === 'salesloft');
        expect(matches).toHaveLength(1);
        expect(matches[0]).toBe('salesloft');
    });

    it('continues past a company whose fetch throws', async () => {
        vi.mocked(fetchWorkable).mockImplementation(async (s) => {
            if (s === 'broken') throw new Error('Workable HTTP 500');
            if (s === 'testco') {
                return [{
                    id: 'ok1', title: 'DevOps Engineer', url: 'https://x', location: 'US',
                    posted_at: 'now', source: 'workable',
                }];
            }
            return [];
        });

        const { jobs } = await scrapeWorkable(true, ['broken', 'testco']);

        expect(jobs).toHaveLength(1);
        expect(jobs[0].id).toBe('ok1');
    });

    it('includes a company in polledCompanies when its fetch succeeds, excludes it when the fetch throws', async () => {
        vi.mocked(fetchWorkable).mockImplementation(async (s) => {
            if (s === 'broken') throw new Error('Workable HTTP 500');
            if (s === 'testco') {
                return [{
                    id: 'ok1', title: 'DevOps Engineer', url: 'https://x', location: 'US',
                    posted_at: 'now', source: 'workable',
                }];
            }
            return [];
        });

        const { polledCompanies } = await scrapeWorkable(true, ['broken', 'testco']);

        expect(polledCompanies).toContain('testco');
        expect(polledCompanies).not.toContain('broken');
    });

    it('includes a company in polledCompanies even with zero postings this run', async () => {
        vi.mocked(fetchWorkable).mockResolvedValue([]);

        const { jobs, polledCompanies } = await scrapeWorkable(true, ['quietco']);

        expect(jobs).toEqual([]);
        expect(polledCompanies).toContain('quietco');
    });
});
