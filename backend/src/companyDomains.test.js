import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
    getOpenJobUrls: vi.fn(), upsertCompanyDomains: vi.fn(), companiesNeedingDomainLookup: vi.fn(), getCompanyDomains: vi.fn(),
}));
vi.mock('./db.js', () => db);
vi.mock('./utils/helpers.js', async (orig) => ({ ...(await orig()), sleep: vi.fn().mockResolvedValue(undefined) }));

const { resolveFromJobUrls, resolveByLookup, attachCompanyDomains } = await import('./companyDomains.js');

describe('company domain resolver', () => {
    beforeEach(() => Object.values(db).forEach(f => f.mockReset()));
    afterEach(() => vi.unstubAllGlobals());

    it('takes the most common company-owned domain from each company\'s job links', async () => {
        db.getOpenJobUrls.mockResolvedValue([
            { company: 'Stripe', url: 'https://stripe.com/jobs/search?gh_jid=1' },
            { company: 'Stripe', url: 'https://stripe.com/jobs/search?gh_jid=2' },
            { company: 'Stripe', url: 'https://job-boards.greenhouse.io/stripe/jobs/3' },
            { company: 'Linear', url: 'https://jobs.ashbyhq.com/linear/1' },
        ]);
        await resolveFromJobUrls();
        expect(db.upsertCompanyDomains).toHaveBeenCalledWith([{ company: 'Stripe', domain: 'stripe.com', source: 'feed' }]);
    });

    it('looks up remaining companies by name and stores a miss as null', async () => {
        db.companiesNeedingDomainLookup.mockResolvedValue(['TSYS', 'Anysphere']);
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            const q = new URL(String(url)).searchParams.get('query');
            const body = q === 'TSYS' ? [{ name: 'TSYS', domain: 'tsys.com' }] : [{ name: 'Anysphere', domain: 'anysphere-messaging.com' }];
            return { ok: true, json: async () => body };
        }));
        await resolveByLookup(10);
        expect(db.upsertCompanyDomains).toHaveBeenCalledWith(expect.arrayContaining([
            { company: 'TSYS', domain: 'tsys.com', source: 'lookup' },
            { company: 'Anysphere', domain: null, source: 'lookup' },
        ]));
    });

    it('skips a company when the lookup service fails, so it is retried later', async () => {
        db.companiesNeedingDomainLookup.mockResolvedValue(['TSYS']);
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
        await resolveByLookup(10);
        expect(db.upsertCompanyDomains).toHaveBeenCalledWith([]);
    });
});


describe('attachCompanyDomains', () => {
    it('adds company_domain (or null) to each job from the stored websites', async () => {
        db.getCompanyDomains.mockResolvedValue(new Map([['Stripe', 'stripe.com']]));
        const jobs = await attachCompanyDomains([{ company: 'Stripe' }, { company: 'Unknown' }]);
        expect(jobs.map(j => j.company_domain)).toEqual(['stripe.com', null]);
    });
});
