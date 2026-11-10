import { describe, it, expect } from 'vitest';
import { domainFromUrl, pickSuggestedDomain } from './companyDomain.js';

describe('domainFromUrl', () => {
    it('returns the registrable domain of a company-owned careers link', () => {
        expect(domainFromUrl('https://stripe.com/jobs/search?gh_jid=8172510')).toBe('stripe.com');
        expect(domainFromUrl('https://careers.doximity.com/jobs/123')).toBe('doximity.com');
        expect(domainFromUrl('https://www.hudsonrivertrading.com/careers/job/?gh_jid=7')).toBe('hudsonrivertrading.com');
        expect(domainFromUrl('https://jobs.example.co.uk/role')).toBe('example.co.uk');
    });

    it('returns null for job boards, ATS hosts and aggregators (not the company site)', () => {
        for (const url of [
            'https://job-boards.greenhouse.io/anthropic/jobs/1',
            'https://jobs.lever.co/palantir/abc',
            'https://jobs.ashbyhq.com/linear/xyz',
            'https://nvidia.wd5.myworkdayjobs.com/NvidiaExternalCareerSite/job/x',
            'https://jobs.smartrecruiters.com/Visa/1',
            'https://apply.workable.com/acme/j/1',
            'https://qualcomm.eightfold.ai/careers/job/1',
            'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1002/job/1',
            'https://news.ycombinator.com/item?id=1',
            'https://himalayas.app/companies/x/jobs/y',
            'https://www.linkedin.com/jobs/view/1',
        ]) expect(domainFromUrl(url)).toBeNull();
    });

    it('returns null for junk', () => {
        expect(domainFromUrl('')).toBeNull();
        expect(domainFromUrl('not a url')).toBeNull();
        expect(domainFromUrl('http://localhost:3000/x')).toBeNull();
    });
});

describe('pickSuggestedDomain', () => {
    it('accepts an exact-name suggestion whose website is the company name', () => {
        expect(pickSuggestedDomain('TSYS', [{ name: 'TSYS', domain: 'tsys.com' }, { name: 'T-Systems', domain: 't-systems.com' }])).toBe('tsys.com');
        expect(pickSuggestedDomain('Sur La Table', [{ name: 'Sur La Table', domain: 'surlatable.com' }])).toBe('surlatable.com');
        expect(pickSuggestedDomain('Teads', [{ name: 'Teads', domain: 'teads.tv' }, { name: 'Teads', domain: 'teads.org' }])).toBe('teads.tv');
    });

    it('rejects lookalikes, non-matching names and unusual country domains', () => {
        expect(pickSuggestedDomain('Anysphere', [{ name: 'Anysphere', domain: 'anysphere-messaging.com' }, { name: 'Anysphere', domain: 'anysphere.id' }])).toBeNull();
        expect(pickSuggestedDomain('Ag', [{ name: 'Agorapulse', domain: 'agorapulse.com' }])).toBeNull();
        expect(pickSuggestedDomain('Clera', [{ name: 'CLERAD', domain: 'clerad.com' }])).toBeNull();
        expect(pickSuggestedDomain('Stripe', [])).toBeNull();
    });
});
