import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseHiringComment, scrapeHackerNewsHiring } from './hackernews.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

const comment = (text, overrides = {}) => ({
    id: 101, author: 'someone', created_at: '2026-10-01T16:00:00.000Z', text, ...overrides,
});

describe('parseHiringComment', () => {
    it('parses a pipe-delimited header into company, role, and location', () => {
        const job = parseHiringComment(comment(
            'Shepherd (Series B) | Software Engineer | ONSITE | San Francisco, CA &amp; New York City, NY<p>At Shepherd, we build...'
        ));

        expect(job).toMatchObject({
            company: 'Shepherd',
            title: 'Software Engineer',
            location: 'ONSITE | San Francisco, CA & New York City, NY',
            url: 'https://news.ycombinator.com/item?id=101',
            source: 'hackernews',
            category: 'swe',
            posted_at: '2026-10-01T16:00:00.000Z',
        });
    });

    it('handles em-dash separators and a location in the company parenthetical', () => {
        const job = parseHiringComment(comment(
            'PrairieLearn (Remote US) — Full-Stack Software Engineer — TypeScript &#x2F; Postgres<p>More text'
        ));

        expect(job.company).toBe('PrairieLearn');
        expect(job.title).toBe('Full-Stack Software Engineer');
        expect(job.category).toBe('fullstack');
        expect(job.location).toContain('Remote US');
    });

    it('picks the first tech role out of a comma-separated role list', () => {
        const job = parseHiringComment(comment(
            'Acme | Product Manager, Backend Engineer, Data Engineer | Remote (US) | Full-time<p>x'
        ));

        expect(job.title).toBe('Backend Engineer');
        expect(job.category).toBe('backend');
    });

    it('returns null when no segment is a tech role', () => {
        expect(parseHiringComment(comment('OpenRent | London, UK | Full-Time | ONSITE<p>Come fix renting'))).toBeNull();
    });

    it('returns null for deleted or empty comments', () => {
        expect(parseHiringComment(comment(null))).toBeNull();
        expect(parseHiringComment(comment(''))).toBeNull();
    });
});

describe('scrapeHackerNewsHiring', () => {
    it('finds the newest "Who is hiring?" story (not "Who wants to be hired?") and returns US-eligible tech jobs', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            const u = String(url);
            if (u.includes('search_by_date')) {
                return {
                    ok: true,
                    json: async () => ({
                        hits: [
                            { objectID: '2', title: 'Ask HN: Who wants to be hired? (October 2026)' },
                            { objectID: '1', title: 'Ask HN: Who is hiring? (October 2026)' },
                        ],
                    }),
                };
            }
            if (u.endsWith('/items/1')) {
                return {
                    ok: true,
                    json: async () => ({
                        children: [
                            comment('Acme | Senior Software Engineer | Remote US<p>x', { id: 1 }),
                            comment('Beta | Software Engineer | Austin, TX<p>x', { id: 2 }),
                            comment('Gamma | Software Engineer | Berlin, Germany<p>x', { id: 3 }),
                            comment('Delta | Office Manager | NYC<p>x', { id: 4 }),
                        ],
                    }),
                };
            }
            return { ok: false, status: 404 };
        }));

        const jobs = await scrapeHackerNewsHiring(true);

        expect(jobs.map(j => j.company)).toEqual(['Beta']);
    });

    it('returns [] (not a throw) when the HN API is down', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));

        await expect(scrapeHackerNewsHiring(true)).resolves.toEqual([]);
    });
});
