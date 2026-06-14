/**
 * Context.dev API client
 *
 * Docs: https://docs.context.dev
 * Env:  CONTEXT_DEV_API_KEY=ctxt_secret_...
 *
 * Credit costs:
 *   scrapeMarkdown    → 1 credit / URL (JS-rendered + iframes)
 *   extractStructured → 10 credits / call (crawls up to maxPages)
 *   webSearch         → 1 credit / result returned (~10 results per query by default)
 */

const BASE = 'https://api.context.dev/v1';

export function isEnabled() {
    const k = process.env.CONTEXT_DEV_API_KEY || '';
    return !!k && !k.startsWith('your_');
}

function authHeaders() {
    return {
        Authorization: `Bearer ${process.env.CONTEXT_DEV_API_KEY}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Scrape a URL to clean Markdown.
 * Renders JavaScript (waitForMs) and exposes embedded iframes (includeFrames) —
 * critical for SPA career pages that load Greenhouse/Lever via React after mount.
 * Cost: 1 credit.
 */
export async function scrapeMarkdown(url, opts = {}) {
    if (!isEnabled()) throw new Error('CONTEXT_DEV_API_KEY not configured');
    const {
        waitForMs = 2000,
        includeFrames = true,
        includeLinks = true,
        useMainContentOnly = false,
        timeoutMs = 45000,
    } = opts;

    const params = new URLSearchParams({
        url,
        waitForMs: String(waitForMs),
        includeFrames: String(includeFrames),
        includeLinks: String(includeLinks),
        useMainContentOnly: String(useMainContentOnly),
    });

    const resp = await fetch(`${BASE}/web/scrape/markdown?${params}`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(timeoutMs + 10000),
    });

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`context.dev scrape HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    return { markdown: data.markdown || '', url: data.url || url };
}

/**
 * Extract structured data from a website using a JSON Schema.
 * Crawls up to maxPages pages following relevant links.
 * Cost: 10 credits per call.
 */
export async function extractStructured(url, schema, opts = {}) {
    if (!isEnabled()) throw new Error('CONTEXT_DEV_API_KEY not configured');
    const {
        maxPages = 5,
        maxDepth = 2,
        instructions = '',
        factCheck = false,
        stopAfterMs = 50000,
        timeoutMs = 120000,
    } = opts;

    const body = {
        url,
        schema,
        maxPages,
        maxDepth,
        factCheck,
        stopAfterMs,
        ...(instructions ? { instructions } : {}),
    };

    const resp = await fetch(`${BASE}/web/extract`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`context.dev extract HTTP ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data = await resp.json();
    return { data: data.data || {}, urlsAnalyzed: data.urls_analyzed || [] };
}

/**
 * Search the web and return ranked results.
 * Cost: 1 credit per result returned.
 */
export async function webSearch(query, opts = {}) {
    if (!isEnabled()) throw new Error('CONTEXT_DEV_API_KEY not configured');
    const {
        freshness,
        includeDomains = [],
        excludeDomains = [],
        timeoutMs = 30000,
    } = opts;

    // API accepts query + optional domain/freshness filters only (no count/limit param).
    const body = {
        query,
        ...(freshness ? { freshness } : {}),
        ...(includeDomains.length ? { includeDomains } : {}),
        ...(excludeDomains.length ? { excludeDomains } : {}),
    };

    const resp = await fetch(`${BASE}/web/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        throw new Error(`context.dev search HTTP ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data = await resp.json();
    return { results: data.results || [] };
}
