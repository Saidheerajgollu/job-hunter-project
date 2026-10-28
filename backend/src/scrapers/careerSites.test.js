import { describe, it, expect } from 'vitest';
import { parseAmazonJob } from './amazon.js';
import { parseAppleHtml } from './apple.js';
import { parseGoogleHtml } from './google.js';
import { parseEightfoldPage } from './eightfold.js';
import { parseByteDanceJob } from './bytedance.js';
import { parseOracleRequisition } from './oraclecloud.js';
import { toCareerSiteJob } from './careerSiteCommon.js';

describe('toCareerSiteJob', () => {
    it('drops non-tech titles, senior titles (when filtering), and non-US locations', () => {
        const base = { company: 'X', url: 'https://x/1', source: 'x', postedAt: '2026-10-01T00:00:00.000Z' };
        expect(toCareerSiteJob({ ...base, title: 'Retail Associate', location: 'Austin, TX' }, true)).toBeNull();
        expect(toCareerSiteJob({ ...base, title: 'Senior Software Engineer', location: 'Austin, TX' }, true)).toBeNull();
        expect(toCareerSiteJob({ ...base, title: 'Software Engineer', location: 'Berlin, Germany' }, true)).toBeNull();
        expect(toCareerSiteJob({ ...base, title: 'Software Engineer', location: 'Austin, TX' }, true)).toMatchObject({
            title: 'Software Engineer', category: 'swe', location: 'Austin, TX',
        });
    });
});

describe('parseAmazonJob', () => {
    it('maps an amazon.jobs search.json row', () => {
        const job = parseAmazonJob({
            title: 'Software Dev Engineer II', job_path: '/en/jobs/10590558/software-dev-engineer-ii',
            normalized_location: 'Portland, Oregon, USA', posted_date: 'October 27, 2026',
            company_name: 'Amazon Data Services, Inc.', description_short: 'Build things',
        }, true);
        expect(job).toMatchObject({
            title: 'Software Dev Engineer II',
            company: 'Amazon',
            location: 'Portland, Oregon, USA',
            url: 'https://www.amazon.jobs/en/jobs/10590558/software-dev-engineer-ii',
            source: 'amazon',
        });
        expect(job.posted_at.startsWith('2026-10-27')).toBe(true);
    });
});

describe('parseAppleHtml', () => {
    it('reads results out of the React Router hydration blob', () => {
        const data = {
            loaderData: {
                search: {
                    totalRecords: 1,
                    searchResults: [{
                        postingTitle: 'Software Engineer, Watch Software', positionId: '200555',
                        transformedPostingTitle: 'software-engineer-watch-software',
                        postDateInGMT: '2026-08-21T10:00:00.000Z',
                        locations: [{ name: 'Cupertino', countryName: 'United States' }],
                    }],
                },
            },
        };
        const html = `<script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(JSON.stringify(data))});</script>`;
        const { jobs, total } = parseAppleHtml(html, true);
        expect(total).toBe(1);
        expect(jobs[0]).toMatchObject({
            title: 'Software Engineer, Watch Software',
            company: 'Apple',
            location: 'Cupertino, United States',
            url: 'https://jobs.apple.com/en-us/details/200555/software-engineer-watch-software',
            posted_at: '2026-08-21T10:00:00.000Z',
        });
    });
});

describe('parseGoogleHtml', () => {
    it('pairs each result link with its title and "Employer | location" line', () => {
        const html = `
            <li><h3 class="x">Software Engineer, YouTube Ads</h3>
            <p class="l103df"><span>YouTube</span> | Mountain View, CA, USA; New York, NY, USA</p>
            <a href="jobs/results/96781496290812614-software-engineer-youtube-ads?q=x">Learn more</a></li>`;
        const [job] = parseGoogleHtml(html, true);
        expect(job).toMatchObject({
            title: 'Software Engineer, YouTube Ads',
            company: 'YouTube',
            location: 'Mountain View, CA, USA; New York, NY, USA',
            url: 'https://www.google.com/about/careers/applications/jobs/results/96781496290812614-software-engineer-youtube-ads',
            source: 'google',
        });
    });
});

describe('parseEightfoldPage', () => {
    it('handles the classic v2 shape', () => {
        const { jobs, count } = parseEightfoldPage({
            count: 107,
            positions: [{
                id: 790298014263, name: 'Software Engineer 4 - TV Product UI',
                locations: ['Los Gatos,California,United States of America'],
                t_create: 1792627200, canonicalPositionUrl: 'https://explore.jobs.netflix.net/careers/job/790298014263',
            }],
        }, { company: 'Netflix', host: 'explore.jobs.netflix.net' }, true);
        expect(count).toBe(107);
        expect(jobs[0]).toMatchObject({
            title: 'Software Engineer 4 - TV Product UI', company: 'Netflix',
            url: 'https://explore.jobs.netflix.net/careers/job/790298014263',
            posted_at: '2026-10-22T00:00:00.000Z', source: 'eightfold',
        });
    });

    it('handles the PCSX shape (payload under data, postedTs, relative positionUrl)', () => {
        const { jobs, count } = parseEightfoldPage({
            data: {
                count: 601,
                positions: [{
                    id: 446721579774, name: 'Software Engineer, Core AI',
                    standardizedLocations: ['San Diego, CA, US'], postedTs: 1792627200,
                    positionUrl: '/careers/job/446721579774',
                }],
            },
        }, { company: 'Qualcomm', host: 'qualcomm.eightfold.ai' }, true);
        expect(count).toBe(601);
        expect(jobs[0].url).toBe('https://qualcomm.eightfold.ai/careers/job/446721579774');
        expect(jobs[0].location).toBe('San Diego, CA, US');
    });
});

describe('parseByteDanceJob', () => {
    const post = {
        id: '7680987768009754885', title: 'Software Engineer, Security',
        description: 'The mission...',
        city_info: {
            en_name: 'San Jose',
            parent: { en_name: 'California', parent: { en_name: 'United States of America', parent: null } },
        },
    };

    it('builds a US location from the nested city/state/country chain and links to the posting', () => {
        const job = parseByteDanceJob(post, { company: 'TikTok', jobUrl: id => `https://lifeattiktok.com/search/${id}` }, true);
        expect(job).toMatchObject({
            title: 'Software Engineer, Security', company: 'TikTok',
            location: 'San Jose, California, United States of America',
            url: 'https://lifeattiktok.com/search/7680987768009754885',
            source: 'bytedance',
            // The API has no posting date — mark it so it never fakes a repost.
            posted_at_estimated: true,
        });
    });

    it('accepts a bare US office city (jobs.bytedance.com has no parent chain) but not a bare foreign one', () => {
        const site = { company: 'ByteDance', jobUrl: id => `https://jobs.bytedance.com/en/position/${id}/detail` };
        expect(parseByteDanceJob({ ...post, city_info: { en_name: 'San Jose' } }, site, true)?.location).toBe('San Jose');
        expect(parseByteDanceJob({ ...post, city_info: { en_name: 'Hangzhou' } }, site, true)).toBeNull();
    });

    it('drops postings outside the US', () => {
        const job = parseByteDanceJob({
            ...post, city_info: { en_name: 'Singapore', parent: { en_name: 'Singapore', parent: null } },
        }, { company: 'TikTok', jobUrl: id => `x/${id}` }, true);
        expect(job).toBeNull();
    });
});

describe('parseOracleRequisition', () => {
    it('maps an Oracle Cloud HCM requisition to the public job URL', () => {
        const job = parseOracleRequisition({
            Id: '210800972', Title: 'Software Engineer II', PostedDate: '2026-10-28',
            PrimaryLocation: 'Wilmington, DE, United States', PrimaryLocationCountry: 'US',
        }, { company: 'JPMorgan Chase', host: 'jpmc.fa.oraclecloud.com', site: 'CX_1002' }, true);
        expect(job).toMatchObject({
            title: 'Software Engineer II', company: 'JPMorgan Chase',
            location: 'Wilmington, DE, United States',
            url: 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1002/job/210800972',
            source: 'oraclecloud',
        });
        expect(job.posted_at.startsWith('2026-10-28')).toBe(true);
    });

    it('drops non-US requisitions by country code', () => {
        expect(parseOracleRequisition({
            Id: '1', Title: 'Software Engineer', PostedDate: '2026-10-28',
            PrimaryLocation: 'Bengaluru, India', PrimaryLocationCountry: 'IN',
        }, { company: 'X', host: 'x.fa.oraclecloud.com', site: 'CX_1' }, true)).toBeNull();
    });
});
