import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectATS } from './atsDetector.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('detectATS — schema.org fallback', () => {
    it('returns ats_type schema-org when the career page has JobPosting data but no recognized ATS', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            // Greenhouse/Lever/Ashby slug probes all fail (simulate no matching board).
            if (String(url).includes('boards-api.greenhouse.io') ||
                String(url).includes('api.lever.co') ||
                String(url).includes('api.ashbyhq.com')) {
                return { ok: false, status: 404 };
            }
            // The HTML-detection career-page fetch succeeds with JobPosting data.
            return {
                ok: true,
                redirect: 'follow',
                url: 'https://careers.testco.com',
                text: async () => `
                    <script type="application/ld+json">
                    {"@type":"JobPosting","title":"Product Engineer","url":"https://testco.com/jobs/1"}
                    </script>
                `,
            };
        }));

        const result = await detectATS('TestCo', 'testco.com');

        expect(result.ats_type).toBe('schema-org');
        expect(result.supported).toBe(true);
    });
});
