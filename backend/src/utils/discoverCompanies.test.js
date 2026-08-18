import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('discoverATSCompanies', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('extracts smartrecruiters, workable, and recruitee slugs from listing URLs', async () => {
        const listings = [
            { url: 'https://careers.smartrecruiters.com/Acme/some-job-id' },
            { url: 'https://apply.workable.com/widgetco/j/ABC123/' },
            { url: 'https://FooBar.recruitee.com/o/software-engineer' },
        ];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => listings,
        }));

        const { discoverATSCompanies } = await import('./discoverCompanies.js');
        const result = await discoverATSCompanies();

        expect(result.smartrecruiters).toEqual(['Acme']);
        expect(result.workable).toEqual(['widgetco']);
        expect(result.recruitee).toEqual(['foobar']);
    });

    it('still extracts greenhouse, lever, and ashby slugs (existing behavior)', async () => {
        const listings = [
            { url: 'https://boards.greenhouse.io/Stripe/jobs/12345' },
            { url: 'https://jobs.lever.co/netflix/abc-def' },
            { url: 'https://jobs.ashbyhq.com/Linear/xyz' },
        ];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => listings,
        }));

        const { discoverATSCompanies } = await import('./discoverCompanies.js');
        const result = await discoverATSCompanies();

        expect(result.greenhouse).toEqual(['stripe']);
        expect(result.lever).toEqual(['netflix']);
        expect(result.ashby).toEqual(['linear']);
    });
});
