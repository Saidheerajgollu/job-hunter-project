import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSmartRecruiters, fetchWorkable, fetchRecruitee } from './atsFetchers.js';

function mockFetchOk(body) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => body,
    }));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('fetchSmartRecruiters', () => {
    it('builds the job URL from slug + id, and joins city/region/country into location', async () => {
        mockFetchOk({
            content: [{
                id: 'abc123',
                name: 'Backend Engineer',
                location: { city: 'Austin', region: 'TX', country: 'US' },
                releasedDate: '2026-01-01T00:00:00.000Z',
            }],
        });

        const [job] = await fetchSmartRecruiters('testco');

        expect(job.url).toBe('https://jobs.smartrecruiters.com/testco/abc123');
        expect(job.location).toBe('Austin, TX, US');
        expect(job.title).toBe('Backend Engineer');
        expect(job.posted_at).toBe('2026-01-01T00:00:00.000Z');
        expect(job.source).toBe('smartrecruiters');
    });

    it('falls back to "Remote" when location fields are absent but remote is true', async () => {
        mockFetchOk({ content: [{ id: 'r1', name: 'Remote Role', location: { remote: true } }] });
        const [job] = await fetchSmartRecruiters('testco');
        expect(job.location).toBe('Remote');
    });

    it('falls back to "US" when location is entirely absent', async () => {
        mockFetchOk({ content: [{ id: 'u1', name: 'Some Role' }] });
        const [job] = await fetchSmartRecruiters('testco');
        expect(job.location).toBe('US');
    });
});

describe('fetchWorkable', () => {
    it('prefers application_url when present', async () => {
        mockFetchOk({ jobs: [{ title: 'Frontend Engineer', application_url: 'https://apply.workable.com/testco/j/XYZ/', city: 'Remote' }] });
        const [job] = await fetchWorkable('testco');
        expect(job.url).toBe('https://apply.workable.com/testco/j/XYZ/');
    });

    it('falls back to a shortcode-built URL when no url fields are present', async () => {
        mockFetchOk({ jobs: [{ title: 'Frontend Engineer', shortcode: 'XYZ' }] });
        const [job] = await fetchWorkable('testco');
        expect(job.url).toBe('https://apply.workable.com/testco/j/XYZ');
    });

    it('joins city/state/country into location, falling back to "Remote" or "US"', async () => {
        mockFetchOk({ jobs: [{ title: 'A', shortcode: 'a', city: 'Boston', state: 'MA', country: 'US' }] });
        const [job] = await fetchWorkable('testco');
        expect(job.location).toBe('Boston, MA, US');
    });
});

describe('fetchRecruitee', () => {
    it('prefers careers_url when present', async () => {
        mockFetchOk({ offers: [{ title: 'Data Engineer', careers_url: 'https://testco.recruitee.com/o/data-engineer' }] });
        const [job] = await fetchRecruitee('testco');
        expect(job.url).toBe('https://testco.recruitee.com/o/data-engineer');
    });

    it('falls back to a slug-built URL when no url fields are present', async () => {
        mockFetchOk({ offers: [{ title: 'Data Engineer', slug: 'data-engineer' }] });
        const [job] = await fetchRecruitee('testco');
        expect(job.url).toBe('https://testco.recruitee.com/o/data-engineer');
    });

    it('falls back to "Remote" when location and city are both absent', async () => {
        mockFetchOk({ offers: [{ title: 'A', slug: 'a' }] });
        const [job] = await fetchRecruitee('testco');
        expect(job.location).toBe('Remote');
    });
});
