import { describe, it, expect } from 'vitest';
import { parseJobPostings, formatJobLocation } from './schemaOrgJobPostings.js';

describe('parseJobPostings', () => {
    it('extracts a single JobPosting object', () => {
        const html = `
            <html><head>
            <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"JobPosting","title":"Software Engineer","url":"https://example.com/jobs/1"}
            </script>
            </head></html>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Software Engineer');
    });

    it('extracts every JobPosting from an array', () => {
        const html = `
            <script type="application/ld+json">
            [
              {"@type":"JobPosting","title":"Backend Engineer","url":"https://example.com/jobs/1"},
              {"@type":"JobPosting","title":"Frontend Engineer","url":"https://example.com/jobs/2"}
            ]
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(2);
        expect(result.map(j => j.title)).toEqual(['Backend Engineer', 'Frontend Engineer']);
    });

    it('extracts JobPostings nested inside a @graph array', () => {
        const html = `
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                {"@type":"Organization","name":"Example Inc"},
                {"@type":"JobPosting","title":"Data Engineer","url":"https://example.com/jobs/3"}
              ]
            }
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Data Engineer');
    });

    it('ignores unrelated JSON-LD blocks and only extracts JobPosting ones', () => {
        const html = `
            <script type="application/ld+json">
            {"@type":"BreadcrumbList","itemListElement":[]}
            </script>
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"ML Engineer","url":"https://example.com/jobs/4"}
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('ML Engineer');
    });

    it('skips a malformed JSON-LD block but still extracts a valid one alongside it', () => {
        const html = `
            <script type="application/ld+json">
            { this is not valid json
            </script>
            <script type="application/ld+json">
            {"@type":"JobPosting","title":"DevOps Engineer","url":"https://example.com/jobs/5"}
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('DevOps Engineer');
    });

    it('returns an empty array when there is no JobPosting data', () => {
        const html = `<html><body><h1>Careers</h1><p>No structured data here.</p></body></html>`;
        expect(parseJobPostings(html)).toEqual([]);
    });

    it('recognizes @type as an array containing JobPosting', () => {
        const html = `
            <script type="application/ld+json">
            {"@type":["JobPosting","Thing"],"title":"Platform Engineer","url":"https://example.com/jobs/6"}
            </script>
        `;
        const result = parseJobPostings(html);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Platform Engineer');
    });
});

describe('formatJobLocation', () => {
    it('joins city/region/country from jobLocation.address', () => {
        const posting = {
            jobLocation: { address: { addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' } },
        };
        expect(formatJobLocation(posting)).toBe('Austin, TX, US');
    });

    it('falls back to Remote when jobLocationType is TELECOMMUTE', () => {
        const posting = { jobLocationType: 'TELECOMMUTE' };
        expect(formatJobLocation(posting)).toBe('Remote');
    });

    it('falls back to Remote when applicantLocationRequirements is present', () => {
        const posting = { applicantLocationRequirements: { '@type': 'Country', name: 'US' } };
        expect(formatJobLocation(posting)).toBe('Remote');
    });

    it('falls back to US when there is no location data at all', () => {
        expect(formatJobLocation({})).toBe('US');
    });
});
