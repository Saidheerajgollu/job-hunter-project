import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./scrapers/greenhouse.js', () => ({ scrapeGreenhouse: vi.fn() }));
vi.mock('./scrapers/lever.js', () => ({ scrapeLever: vi.fn() }));
vi.mock('./scrapers/ashby.js', () => ({ scrapeAshby: vi.fn() }));
vi.mock('./scrapers/workday.js', () => ({ scrapeWorkday: vi.fn() }));
vi.mock('./scrapers/smartrecruiters.js', () => ({ scrapeSmartRecruiters: vi.fn() }));
vi.mock('./scrapers/workable.js', () => ({ scrapeWorkable: vi.fn() }));
vi.mock('./scrapers/recruitee.js', () => ({ scrapeRecruitee: vi.fn() }));
vi.mock('./utils/discoverCompanies.js', () => ({ discoverATSCompanies: vi.fn() }));
vi.mock('./db.js', () => ({
    insertJob: vi.fn(),
    closeStaleJobs: vi.fn(),
    getAllSettings: vi.fn(),
}));

import { scrapeGreenhouse } from './scrapers/greenhouse.js';
import { scrapeLever } from './scrapers/lever.js';
import { scrapeAshby } from './scrapers/ashby.js';
import { scrapeWorkday } from './scrapers/workday.js';
import { scrapeSmartRecruiters } from './scrapers/smartrecruiters.js';
import { scrapeWorkable } from './scrapers/workable.js';
import { scrapeRecruitee } from './scrapers/recruitee.js';
import { discoverATSCompanies } from './utils/discoverCompanies.js';
import { insertJob, closeStaleJobs, getAllSettings } from './db.js';
import { runFastAtsPoll } from './fastPoll.js';

const EMPTY = { jobs: [], polledCompanies: [], seenUrls: [] };

function mockAllEmpty() {
    vi.mocked(scrapeGreenhouse).mockResolvedValue(EMPTY);
    vi.mocked(scrapeLever).mockResolvedValue(EMPTY);
    vi.mocked(scrapeAshby).mockResolvedValue(EMPTY);
    vi.mocked(scrapeWorkday).mockResolvedValue(EMPTY);
    vi.mocked(scrapeSmartRecruiters).mockResolvedValue(EMPTY);
    vi.mocked(scrapeWorkable).mockResolvedValue(EMPTY);
    vi.mocked(scrapeRecruitee).mockResolvedValue(EMPTY);
}

describe('runFastAtsPoll', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAllEmpty();
        vi.mocked(discoverATSCompanies).mockResolvedValue({
            greenhouse: [], lever: [], ashby: [], smartrecruiters: [], workable: [], recruitee: [],
        });
        vi.mocked(getAllSettings).mockResolvedValue({ filter_exclude_senior: 'true' });
        vi.mocked(insertJob).mockResolvedValue(true);
        vi.mocked(closeStaleJobs).mockResolvedValue({ closed: 0, incremented: 0 });
    });

    it('inserts eligible jobs and calls closeStaleJobs with the source, polledCompanies, and fresh URLs', async () => {
        vi.mocked(scrapeGreenhouse).mockResolvedValue({
            jobs: [{
                id: 'gh1', title: 'Software Engineer', company: 'Testco', location: 'Remote, US',
                url: 'https://boards.greenhouse.io/testco/jobs/1', source: 'greenhouse',
                category: 'swe', salary: null, description: null, posted_at: '2026-01-01T00:00:00.000Z',
            }],
            polledCompanies: ['Testco'],
            seenUrls: ['https://boards.greenhouse.io/testco/jobs/1'],
        });

        const result = await runFastAtsPoll();

        expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'gh1' }));
        expect(closeStaleJobs).toHaveBeenCalledWith(
            'greenhouse',
            ['Testco'],
            ['https://boards.greenhouse.io/testco/jobs/1']
        );
        expect(result.totalFound).toBe(1);
        expect(result.totalNew).toBe(1);
    });

    it('includes a job in the freshUrls passed to closeStaleJobs even when it fails eligibility filtering', async () => {
        vi.mocked(scrapeLever).mockResolvedValue({
            jobs: [{
                id: 'lv1', title: 'Software Engineer', company: 'Testco', location: 'Berlin, Germany',
                url: 'https://jobs.lever.co/testco/1', source: 'lever',
                category: 'swe', salary: null, description: null, posted_at: '2026-01-01T00:00:00.000Z',
            }],
            polledCompanies: ['Testco'],
            seenUrls: ['https://jobs.lever.co/testco/1'],
        });

        await runFastAtsPoll();

        expect(insertJob).not.toHaveBeenCalled();
        expect(closeStaleJobs).toHaveBeenCalledWith(
            'lever',
            ['Testco'],
            ['https://jobs.lever.co/testco/1']
        );
    });

    it('passes the full seenUrls list (not just classified jobs) to closeStaleJobs, so a posting the classifier drops is never mistaken for closed', async () => {
        vi.mocked(scrapeGreenhouse).mockResolvedValue({
            jobs: [{
                id: 'gh1', title: 'Software Engineer', company: 'Testco', location: 'Remote, US',
                url: 'https://boards.greenhouse.io/testco/jobs/1', source: 'greenhouse',
                category: 'swe', salary: null, description: null, posted_at: '2026-01-01T00:00:00.000Z',
            }],
            polledCompanies: ['Testco'],
            seenUrls: [
                'https://boards.greenhouse.io/testco/jobs/1',
                'https://boards.greenhouse.io/testco/jobs/2',
            ],
        });

        await runFastAtsPoll();

        expect(closeStaleJobs).toHaveBeenCalledWith(
            'greenhouse',
            ['Testco'],
            ['https://boards.greenhouse.io/testco/jobs/1', 'https://boards.greenhouse.io/testco/jobs/2']
        );
    });

    it('disables the closer sweep for Workday and SmartRecruiters (sampled/capped listings) by passing an empty polledCompanies list', async () => {
        vi.mocked(scrapeWorkday).mockResolvedValue({
            jobs: [{
                id: 'wd1', title: 'Software Engineer', company: 'Salesforce', location: 'San Francisco, CA',
                url: 'https://salesforce.wd1.myworkdayjobs.com/jobs/1', source: 'workday',
                category: 'swe', salary: null, description: null, posted_at: '2026-01-01T00:00:00.000Z',
            }],
            polledCompanies: ['Salesforce'],
            seenUrls: ['https://salesforce.wd1.myworkdayjobs.com/jobs/1'],
        });
        vi.mocked(scrapeSmartRecruiters).mockResolvedValue({
            jobs: [{
                id: 'sr1', title: 'Software Engineer', company: 'Visa', location: 'Austin, TX',
                url: 'https://jobs.smartrecruiters.com/Visa/1', source: 'smartrecruiters',
                category: 'swe', salary: null, description: null, posted_at: '2026-01-01T00:00:00.000Z',
            }],
            polledCompanies: ['Visa'],
            seenUrls: ['https://jobs.smartrecruiters.com/Visa/1'],
        });

        await runFastAtsPoll();

        // Closer disabled: real polledCompanies replaced with [] so closeStaleJobs no-ops.
        expect(closeStaleJobs).toHaveBeenCalledWith(
            'workday', [], ['https://salesforce.wd1.myworkdayjobs.com/jobs/1']
        );
        expect(closeStaleJobs).toHaveBeenCalledWith(
            'smartrecruiters', [], ['https://jobs.smartrecruiters.com/Visa/1']
        );
        expect(closeStaleJobs).not.toHaveBeenCalledWith('workday', ['Salesforce'], expect.anything());
        expect(closeStaleJobs).not.toHaveBeenCalledWith('smartrecruiters', ['Visa'], expect.anything());

        // Jobs still get inserted for these sources — only closing is disabled.
        expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'wd1' }));
        expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'sr1' }));
    });

    it('keeps the closer sweep enabled for complete-enumeration sources, passing their real polledCompanies', async () => {
        vi.mocked(scrapeGreenhouse).mockResolvedValue({
            jobs: [],
            polledCompanies: ['Testco'],
            seenUrls: ['https://boards.greenhouse.io/testco/jobs/1'],
        });

        await runFastAtsPoll();

        expect(closeStaleJobs).toHaveBeenCalledWith(
            'greenhouse', ['Testco'], ['https://boards.greenhouse.io/testco/jobs/1']
        );
    });

    it('continues past a source whose scraper throws, and still runs the others', async () => {
        vi.mocked(scrapeAshby).mockRejectedValue(new Error('Ashby is down'));

        const result = await runFastAtsPoll();

        expect(result.errors.some(e => e.includes('Ashby'))).toBe(true);
        expect(closeStaleJobs).toHaveBeenCalledWith('greenhouse', [], []);
        expect(closeStaleJobs).toHaveBeenCalledWith('workday', [], []);
    });
});
