import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSmartRecruiters, fetchWorkable, fetchRecruitee, fetchSchemaOrgJobs, resolveEmbeddedAts, isSupportedAts } from './atsFetchers.js';

function mockFetchOk(body) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => body,
    }));
}

function mockFetchHtml(html) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
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

describe('fetchSchemaOrgJobs', () => {
    it('parses JobPosting data from the career page and normalizes it', async () => {
        mockFetchHtml(`
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"Software Engineer","url":"https://example.com/jobs/1","datePosted":"2026-01-01T00:00:00.000Z","jobLocation":{"address":{"addressLocality":"Austin","addressRegion":"TX"}}}
            </script>
        `);

        const [job] = await fetchSchemaOrgJobs('https://example.com/careers');

        expect(job.title).toBe('Software Engineer');
        expect(job.url).toBe('https://example.com/jobs/1');
        expect(job.location).toBe('Austin, TX');
        expect(job.posted_at).toBe('2026-01-01T00:00:00.000Z');
        expect(job.source).toBe('schema-org');
    });

    it('falls back to the career page URL when a posting has no url field', async () => {
        mockFetchHtml(`
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"Backend Engineer"}
            </script>
        `);

        const [job] = await fetchSchemaOrgJobs('https://example.com/careers');

        expect(job.url).toBe('https://example.com/careers');
    });

    it('throws on a non-OK response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        await expect(fetchSchemaOrgJobs('https://example.com/careers')).rejects.toThrow('schema-org HTTP 500');
    });
});

describe('isSupportedAts', () => {
    it('recognizes schema-org as a supported ATS type', () => {
        expect(isSupportedAts('schema-org')).toBe(true);
    });
});

describe('resolveEmbeddedAts — schema.org detection', () => {
    it('returns ats_type schema-org when the page has JobPosting data but no recognized ATS URL pattern', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            url: 'https://example.com/careers',
            text: async () => `
                <script type="application/ld+json">
                {"@type":"JobPosting","title":"Site Reliability Engineer","url":"https://example.com/jobs/9"}
                </script>
            `,
        }));

        const result = await resolveEmbeddedAts('https://example.com/careers', false);

        expect(result).toEqual({
            ats_type: 'schema-org',
            ats_slug: null,
            career_url: 'https://example.com/careers',
        });
    });

    it('still prefers a recognized ATS URL pattern over schema.org data when both are present', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            url: 'https://example.com/careers',
            text: async () => `
                <a href="https://boards.greenhouse.io/testco">Apply here</a>
                <script type="application/ld+json">
                {"@type":"JobPosting","title":"Also Listed Here","url":"https://example.com/jobs/10"}
                </script>
            `,
        }));

        const result = await resolveEmbeddedAts('https://example.com/careers', false);

        expect(result.ats_type).toBe('greenhouse');
    });

    it('returns null when there is neither a recognized ATS pattern nor JobPosting data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            url: 'https://example.com/careers',
            text: async () => `<html><body>Just a plain careers page.</body></html>`,
        }));

        const result = await resolveEmbeddedAts('https://example.com/careers', false);

        expect(result).toBeNull();
    });
});
