/**
 * What a job posting says about visa sponsorship, from its title and
 * (often truncated) description. Citizenship / clearance wording is handled
 * separately (isUSCitizenshipRequired) and keeps those jobs out of the feed.
 */

const NO_SPONSORSHIP = [
    /\bno\s+(?:visa\s+)?sponsorship\b/i,
    /\b(?:unable|not\s+able)\s+to\s+(?:provide\s+|offer\s+)?sponsor/i,
    /\b(?:will|can|do(?:es)?)\s*n[o']t\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor/i,
    /\bcannot\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor/i,
    /\b(?:does|do|will)\s+not\s+offer\s+(?:visa\s+)?sponsorship\b/i,
    /\bwithout\s+(?:the\s+need\s+for\s+)?(?:current\s+or\s+future\s+)?(?:visa\s+|employer\s+)?sponsorship\b/i,
    /\bsponsorship\s+(?:is\s+)?not\s+(?:available|offered|provided)\b/i,
    /\bnot\s+eligible\s+for\s+(?:visa\s+)?sponsorship\b/i,
];

// Positive wording must mention visas / H-1B / immigration, so "we sponsor
// hackathons" or "event sponsorship available" don't count.
const SPONSORS = [
    /\b(?:visa|h-?1b|immigration|work\s+authorization)\s+sponsorship\s+(?:is\s+)?(?:available|offered|provided)\b/i,
    /\b(?:will|can|we|happy\s+to|able\s+to)\s+sponsor\s+(?:an?\s+)?(?:visas?|h-?1b|work\s+visas?|employment\s+visas?|green\s+cards?)\b/i,
    /\bopen\s+to\s+sponsoring\s+(?:visas?|h-?1b)\b/i,
    /\bsponsorship\s+(?:for\s+)?(?:visas?|h-?1b)\s+(?:is\s+)?(?:available|offered|provided)\b/i,
];

/** 'no_sponsorship' | 'sponsors' | null. Negative wording wins when both appear. */
export function detectVisaWording(title, description = '') {
    const text = `${title || ''} ${description || ''}`;
    if (NO_SPONSORSHIP.some(re => re.test(text))) return 'no_sponsorship';
    if (SPONSORS.some(re => re.test(text))) return 'sponsors';
    return null;
}
