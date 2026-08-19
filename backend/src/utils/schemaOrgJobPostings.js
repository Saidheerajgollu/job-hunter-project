/**
 * Parses schema.org JobPosting structured data (the same JSON-LD markup
 * Google for Jobs indexes) directly out of a career page's raw HTML, with
 * no ATS integration needed. Consumed by atsDetector.js (to classify a
 * company as `schema-org` instead of `custom`) and atsFetchers.js (to
 * actually fetch job listings for one).
 */

const LD_JSON_ATTR_RE = /type=["']application\/ld\+json["']/i;

// Caps how large an HTML document we'll scan at all.
const MAX_HTML_LENGTH = 4_000_000;
const MAX_GRAPH_DEPTH = 20;

function isJobPosting(value) {
    if (!value || typeof value !== 'object') return false;
    const type = value['@type'];
    if (typeof type === 'string') return type === 'JobPosting';
    if (Array.isArray(type)) return type.includes('JobPosting');
    return false;
}

function collectJobPostings(value, out, depth = 0) {
    if (depth > MAX_GRAPH_DEPTH) return;
    if (Array.isArray(value)) {
        for (const item of value) collectJobPostings(item, out, depth + 1);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (isJobPosting(value)) out.push(value);
    if (Array.isArray(value['@graph'])) collectJobPostings(value['@graph'], out, depth + 1);
}

/**
 * Finds every <script ...>...</script> block via linear indexOf scanning —
 * deliberately NOT a regex. A regex spanning "open tag" through "closing
 * tag" (e.g. `<script\b([^>]*)>([\s\S]*?)<\/script>`) is catastrophically
 * slow on adversarial input with many <script> opens and no matching closes
 * anywhere (a single unauthenticated request can block the event loop for
 * tens of seconds) — the earlier fix in this file only bounded the
 * attribute-capture half of that regex and missed this half. A forward-only
 * indexOf walk cannot backtrack, so it's O(n) regardless of input shape:
 * the moment a search for '</script' fails, there is provably no closing
 * tag anywhere in the remainder of the string, so scanning stops entirely
 * rather than repeating that same failing search for every subsequent
 * <script> occurrence (which is what would silently reintroduce the
 * quadratic blowup, one occurrence at a time).
 */
function extractScriptBlocks(html) {
    const blocks = [];
    let pos = 0;

    while (true) {
        const openStart = html.indexOf('<script', pos);
        if (openStart === -1) break;

        const tagEnd = html.indexOf('>', openStart);
        if (tagEnd === -1) break; // unclosed opening tag — nothing usable follows

        const attrs = html.slice(openStart + '<script'.length, tagEnd);

        const closeStart = html.indexOf('</script', tagEnd);
        if (closeStart === -1) break; // see function comment: stop entirely, don't keep searching

        blocks.push({ attrs, body: html.slice(tagEnd + 1, closeStart) });

        const closeTagEnd = html.indexOf('>', closeStart);
        pos = closeTagEnd === -1 ? closeStart + '</script'.length : closeTagEnd + 1;
    }

    return blocks;
}

export function parseJobPostings(html) {
    const postings = [];
    const bounded = String(html).slice(0, MAX_HTML_LENGTH);
    for (const { attrs, body } of extractScriptBlocks(bounded)) {
        if (!LD_JSON_ATTR_RE.test(attrs)) continue;
        let parsed;
        try {
            parsed = JSON.parse(body);
        } catch {
            continue;
        }
        collectJobPostings(parsed, postings);
    }
    return postings;
}

export function formatJobLocation(posting) {
    let jobLocation = posting.jobLocation;
    if (Array.isArray(jobLocation)) jobLocation = jobLocation[0];

    let address = jobLocation?.address;
    if (Array.isArray(address)) address = address[0];

    if (typeof address === 'string' && address.trim()) {
        return address.trim();
    }
    if (address && typeof address === 'object') {
        const parts = [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean);
        if (parts.length) return parts.join(', ');
    }
    if (posting.jobLocationType === 'TELECOMMUTE' || posting.applicantLocationRequirements) {
        return 'Remote';
    }
    return '';
}
