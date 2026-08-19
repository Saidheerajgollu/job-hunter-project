/**
 * Parses schema.org JobPosting structured data (the same JSON-LD markup
 * Google for Jobs indexes) directly out of a career page's raw HTML, with
 * no ATS integration needed. Consumed by atsDetector.js (to classify a
 * company as `schema-org` instead of `custom`) and atsFetchers.js (to
 * actually fetch job listings for one).
 */

// Bounded attribute capture (not `[^>]*type=...[^>]*`, which has two
// adjacent unbounded quantifiers separated by a required literal — a
// catastrophic-backtracking shape on adversarial input, and this input is
// always adversarial: it's whatever HTML a third-party career page returns).
const SCRIPT_BLOCK_RE = /<script\b([^>]{0,400})>([\s\S]*?)<\/script>/gi;
const LD_JSON_ATTR_RE = /type=["']application\/ld\+json["']/i;

// Caps how large an HTML document we'll scan at all, and (combined with the
// bounded regex above) how much backtracking work is even possible.
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

export function parseJobPostings(html) {
    const postings = [];
    const bounded = String(html).slice(0, MAX_HTML_LENGTH);
    for (const [, attrs, body] of bounded.matchAll(SCRIPT_BLOCK_RE)) {
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
