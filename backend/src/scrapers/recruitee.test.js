import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRecruitee } from '../watchers/atsFetchers.js';
import { scrapeRecruitee } from './recruitee.js';

vi.mock('../watchers/atsFetchers.js', () => ({
    fetchRecruitee: vi.fn(),
}));

function mockPostingsFor(slug, postings) {
    vi.mocked(fetchRecruitee).mockImplementation(async (s) => (s === slug ? postings : []));
}

describe('scrapeRecruitee', () => {
    beforeEach(() => {
        vi.mocked(fetchRecruitee).mockReset();
        vi.mocked(fetchRecruitee).mockResolvedValue([]);
    });

    it('classifies and maps raw postings into job records, using the slug as company name for discovered companies', async () => {
        mockPostingsFor('testco', [{
            id: 'abc123',
            title: 'Data Engineer',
            url: 'https://testco.recruitee.com/o/data-engineer',
            location: 'Remote',
            posted_at: '2026-01-01T00:00:00.000Z',
            source: 'recruitee',
        }]);

        const jobs = await scrapeRecruitee(true, ['testco']);

        expect(jobs).toContainEqual({
            id: 'abc123',
            title: 'Data Engineer',
            company: 'testco',
            location: 'Remote',
            url: 'https://testco.recruitee.com/o/data-engineer',
            source: 'recruitee',
            category: 'data-engineer',
            salary: null,
            description: null,
            posted_at: '2026-01-01T00:00:00.000Z',
        });
    });

    it('filters out senior roles when filterSenior is true', async () => {
        mockPostingsFor('testco', [{
            id: 'sr1', title: 'Staff Software Engineer', url: 'https://x', location: 'US',
            posted_at: 'now', source: 'recruitee',
        }]);

        const jobs = await scrapeRecruitee(true, ['testco']);
        expect(jobs).toHaveLength(0);
    });

    it('skips postings that are not tech roles', async () => {
        mockPostingsFor('testco', [{
            id: 'nc1', title: 'Recruiter', url: 'https://x', location: 'US',
            posted_at: 'now', source: 'recruitee',
        }]);

        const jobs = await scrapeRecruitee(true, ['testco']);
        expect(jobs).toHaveLength(0);
    });

    it('continues past a company whose fetch throws', async () => {
        vi.mocked(fetchRecruitee).mockImplementation(async (s) => {
            if (s === 'broken') throw new Error('Recruitee HTTP 500');
            if (s === 'testco') {
                return [{
                    id: 'ok1', title: 'Site Reliability Engineer', url: 'https://x', location: 'US',
                    posted_at: 'now', source: 'recruitee',
                }];
            }
            return [];
        });

        const jobs = await scrapeRecruitee(true, ['broken', 'testco']);

        expect(jobs).toHaveLength(1);
        expect(jobs[0].id).toBe('ok1');
    });
});
