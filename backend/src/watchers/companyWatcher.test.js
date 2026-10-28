import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
    getOpenJobsForCompanies: vi.fn(),
    updateWatchedCompanyState: vi.fn(),
    insertWatchNotification: vi.fn(),
    incrementWatchNotifyCount: vi.fn(),
    insertJob: vi.fn(),
}));
const push = vi.hoisted(() => ({ sendPushToAll: vi.fn() }));

vi.mock('../db.js', () => db);
vi.mock('../utils/pushNotifications.js', () => push);

const { handleFeedMatch } = await import('./companyWatcher.js');
const { buildCompanyIndex } = await import('../utils/companyNames.js');

const job = (id, title = 'Software Engineer') => ({ id, title, url: `https://x/${id}`, location: 'Austin, TX', source: 'simplifyjobs' });

describe('handleFeedMatch (watchlist companies with no ATS)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('matches the watched name against feed spellings like "Expedia Group" vs "Expedia, Inc."', async () => {
        db.getOpenJobsForCompanies.mockResolvedValue([job('a')]);
        const index = buildCompanyIndex(['Expedia, Inc.', 'Stripe']);

        await handleFeedMatch({ id: 'c1', name: 'Expedia Group', last_job_hash: null }, null, false, index);

        expect(db.getOpenJobsForCompanies).toHaveBeenCalledWith(['Expedia, Inc.']);
    });

    it('stores state silently when switching from the old page-hash mode (no alert burst)', async () => {
        db.getOpenJobsForCompanies.mockResolvedValue([job('a'), job('b')]);
        const index = buildCompanyIndex(['Tesla']);

        await handleFeedMatch({ id: 'c1', name: 'Tesla', last_job_hash: 'oldpagehash', last_job_ids: '[]' }, null, false, index);

        expect(push.sendPushToAll).not.toHaveBeenCalled();
        const saved = db.updateWatchedCompanyState.mock.calls[0][0];
        expect(saved.last_job_hash.startsWith('feed:')).toBe(true);
        expect(saved.active_jobs_count).toBe(2);
    });

    it('alerts with the real job title once a new matching job appears', async () => {
        db.getOpenJobsForCompanies.mockResolvedValue([job('a')]);
        const index = buildCompanyIndex(['Tesla']);
        await handleFeedMatch({ id: 'c1', name: 'Tesla', last_job_hash: null }, null, false, index);
        const first = db.updateWatchedCompanyState.mock.calls[0][0];

        db.getOpenJobsForCompanies.mockResolvedValue([job('a'), job('b', 'Backend Engineer')]);
        await handleFeedMatch({ id: 'c1', name: 'Tesla', ...first }, null, false, index);

        expect(push.sendPushToAll).toHaveBeenCalledTimes(1);
        expect(push.sendPushToAll.mock.calls[0][0].body).toContain('Backend Engineer');
        // Feed jobs are already stored — never re-inserted.
        expect(db.insertJob).not.toHaveBeenCalled();
    });
});
