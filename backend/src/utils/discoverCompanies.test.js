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

    it('extracts SmartRecruiters slugs from the jobs.smartrecruiters.com host SimplifyJobs actually uses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ url: 'https://jobs.smartrecruiters.com/AristaNetworks/744000136204119' }],
        }));

        const { discoverATSCompanies } = await import('./discoverCompanies.js');
        const result = await discoverATSCompanies();

        expect(result.smartrecruiters).toEqual(['AristaNetworks']);
    });

    it('extracts the newer job-boards.greenhouse.io host', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ url: 'https://job-boards.greenhouse.io/anthropic/jobs/4020305008' }],
        }));

        const { discoverATSCompanies } = await import('./discoverCompanies.js');
        const result = await discoverATSCompanies();

        expect(result.greenhouse).toEqual(['anthropic']);
    });

    it('extracts Workday tenants as career URLs (one per tenant + site), skipping locale segments', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { url: 'https://generalmotors.wd5.myworkdayjobs.com/Careers_GM/job/Sunnyvale/Software-Engineer_JR-1', company_name: 'General Motors', active: true },
                { url: 'https://generalmotors.wd5.myworkdayjobs.com/en-US/Careers_GM/job/Austin/Data-Engineer_JR-2', company_name: 'General Motors', active: true },
                { url: 'https://globalhr.wd5.myworkdayjobs.com/rec_rtx_ext_gateway/job/X/Y_01790413', company_name: 'RTX', active: true },
                { url: 'https://oldco.wd1.myworkdayjobs.com/Ext/job/Z_1', company_name: 'OldCo', active: false },
            ],
        }));

        const { discoverATSCompanies } = await import('./discoverCompanies.js');
        const result = await discoverATSCompanies();

        expect(result.workday).toEqual([
            { company: 'General Motors', careerUrl: 'https://generalmotors.wd5.myworkdayjobs.com/Careers_GM' },
            { company: 'RTX', careerUrl: 'https://globalhr.wd5.myworkdayjobs.com/rec_rtx_ext_gateway' },
        ]);
    });

    it('extracts Eightfold and Oracle Cloud HCM career sites from active listings', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { url: 'https://qualcomm.eightfold.ai/careers/job/446721579774', company_name: 'Qualcomm', active: true },
                { url: 'https://ibqbjb.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/Honeywell/job/140055', company_name: 'Honeywell', active: true },
                { url: 'https://old.eightfold.ai/careers/job/1', company_name: 'Old', active: false },
            ],
        }));

        const { discoverATSCompanies } = await import('./discoverCompanies.js');
        const result = await discoverATSCompanies();

        expect(result.eightfold).toEqual([{ company: 'Qualcomm', host: 'qualcomm.eightfold.ai', domain: 'qualcomm.com' }]);
        expect(result.oraclecloud).toEqual([{ company: 'Honeywell', host: 'ibqbjb.fa.ocs.oraclecloud.com', site: 'Honeywell' }]);
    });
});
