/**
 * Parses schema.org JobPosting structured data (the same JSON-LD markup
 * Google for Jobs indexes) directly out of a career page's raw HTML, with
 * no ATS integration needed. Consumed by atsDetector.js (to classify a
 * company as `schema-org` instead of `custom`) and atsFetchers.js (to
 * actually fetch job listings for one).
 */

const SCRIPT_BLOCK_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function isJobPosting(value) {
    if (!value || typeof value !== 'object') return false;
    const type = value['@type'];
    if (typeof type === 'string') return type === 'JobPosting';
    if (Array.isArray(type)) return type.includes('JobPosting');
    return false;
}

function collectJobPostings(value, out) {
    if (Array.isArray(value)) {
        for (const item of value) collectJobPostings(item, out);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (isJobPosting(value)) out.push(value);
    if (Array.isArray(value['@graph'])) collectJobPostings(value['@graph'], out);
}

export function parseJobPostings(html) {
    const postings = [];
    for (const match of html.matchAll(SCRIPT_BLOCK_RE)) {
        let parsed;
        try {
            parsed = JSON.parse(match[1]);
        } catch {
            continue;
        }
        collectJobPostings(parsed, postings);
    }
    return postings;
}

export function formatJobLocation(posting) {
    const address = posting.jobLocation?.address;
    if (address) {
        const parts = [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean);
        if (parts.length) return parts.join(', ');
    }
    if (posting.jobLocationType === 'TELECOMMUTE' || posting.applicantLocationRequirements) {
        return 'Remote';
    }
    return 'US';
}
