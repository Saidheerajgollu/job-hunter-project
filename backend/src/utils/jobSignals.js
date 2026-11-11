/**
 * Facts read out of a posting's own text with plain rules (no AI):
 * years of experience asked for, remote / hybrid / on-site, a pay range,
 * and whether the employer says it uses E-Verify (STEM OPT needs that).
 * Every value is null / false when the text doesn't clearly say.
 */

const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
// "3+ years of experience", "2-4 years of professional software experience",
// "5+ years' experience". The word "experience" must follow within a few words.
const YOE_RE = new RegExp(
    `\\b${NUM}\\s*\\+?\\s*(?:(?:-|–|—|to)\\s*${NUM}\\s*\\+?\\s*)?(?:or more\\s+)?years?['’]?\\s+(?:of\\s+)?(?:[a-z/-]+\\s+){0,3}experience\\b`,
    'gi'
);
const MAX_PLAUSIBLE_YOE = 15;

// "intern" must be a whole word: not "internal" or "international".
const ENTRY_TITLE_RE = /\b(intern|internship|co-?op|new\s+grad(?:uate)?s?|university\s+grad(?:uate)?s?|recent\s+grad(?:uate)?s?|college\s+grad(?:uate)?s?|entry[- ]level|early\s+career|campus\s+hire|apprentice(?:ship)?)\b/i;

function toNumber(token) {
    const t = String(token).toLowerCase();
    return t in NUMBER_WORDS ? NUMBER_WORDS[t] : Number(t);
}

// "We have 12 years of experience serving clients" is about the company.
const COMPANY_YEARS_RE = /\b(?:we\s+have|we['’]ve|we\s+bring|company\s+has|team\s+has|with\s+over)\s*$/i;

/** Years of experience the posting asks for (its first such line), or null when it doesn't say. */
export function extractMinYoe(title, description) {
    if (ENTRY_TITLE_RE.test(title || '')) return 0;
    if (!description) return null;
    YOE_RE.lastIndex = 0;
    let m;
    while ((m = YOE_RE.exec(description))) {
        const n = toNumber(m[1]);
        if (n > MAX_PLAUSIBLE_YOE) continue;
        if (COMPANY_YEARS_RE.test(description.slice(Math.max(0, m.index - 20), m.index))) continue;
        return n;
    }
    return null;
}

const NEGATED_REMOTE_RE = /\bnot\s+(?:a\s+|an\s+)?(?:fully\s+)?remote\b/i;
const DESC_HYBRID_RE = /\bhybrid\s+(?:role|position|work|schedule|model|environment|opportunity)\b|\b(?:role|position|job)\s+is\s+hybrid\b|\bhybrid\s*[.,:(-]/i;
const DESC_REMOTE_RE = /\b(?:fully|100%|completely)\s+remote\b|\bremote[- ]first\b|\b(?:this\s+is\s+a|is\s+a)\s+remote\s+(?:role|position|job|opportunity)\b|\b(?:role|position|job)\s+is\s+remote\b|\bwork\s+remotely\s+from\s+anywhere\b/i;
const DESC_ONSITE_RE = /\b(?:role|position|job)\s+is\s+(?:fully\s+)?(?:on-?site|in[- ]office|in[- ]person)\b|\b(?:on-?site|in[- ]office|in[- ]person)\s+(?:role|position|five|5|four|4)\b|\b(?:five|5)\s+days\s+(?:a|per)\s+week\s+in\s+(?:the\s+|our\s+)?office\b/i;

/** 'remote' | 'hybrid' | 'onsite' | null. The location line wins over the description. */
export function extractWorkModel(location, description) {
    const loc = location || '';
    if (/\bhybrid\b/i.test(loc)) return 'hybrid';
    if (/\bremote\b/i.test(loc)) return 'remote';
    if (/\b(?:on-?site|in[- ]office)\b/i.test(loc)) return 'onsite';
    const text = description || '';
    if (!text) return null;
    if (DESC_HYBRID_RE.test(text)) return 'hybrid';
    if (DESC_REMOTE_RE.test(text) && !NEGATED_REMOTE_RE.test(text)) return 'remote';
    if (DESC_ONSITE_RE.test(text)) return 'onsite';
    return null;
}

const MONEY = `\\$\\s?(\\d{1,3}(?:,\\d{3})+|\\d{2,6})(?:\\.\\d{1,2})?\\s?([kK])?`;
const PER = `(?:\\s?(?:/|per\\s|an?\\s)\\s?(?:yr|year|annum|hr|hour))?`;
const RANGE_RE = new RegExp(`${MONEY}${PER}\\s*(?:-|–|—|to)\\s*${MONEY}`, 'g');
const HOURLY_AFTER_RE = /^(?:\.\d{1,2})?\s*(?:usd\s*)?(?:\/\s?(?:hr|hour)|per\s+hour|an\s+hour|hourly)/i;
const HOURLY_BEFORE_RE = /hourly\s+(?:rate|pay|wage|range)[^$]{0,20}$/i;

function amount(digits, k) {
    const n = Number(digits.replace(/,/g, ''));
    return k ? n * 1000 : n;
}

// A range right after one of these words is not base pay.
const NOT_PAY_BEFORE_RE = /\b(?:bonus(?:es)?|equity|stock|rsus?|sign[- ]?on|relocation|stipend|raised|funding|revenue)\b[^$.]{0,25}$/i;

const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;

/** A pay range written in the posting ("$120,000 – $150,000", "$45 – $60/hr"), or null. */
export function extractSalary(description) {
    if (!description) return null;
    RANGE_RE.lastIndex = 0;
    let m;
    while ((m = RANGE_RE.exec(description))) {
        const low = amount(m[1], m[2]);
        const high = amount(m[3], m[4]);
        if (high < low) continue;
        const before = description.slice(Math.max(0, m.index - 40), m.index);
        if (NOT_PAY_BEFORE_RE.test(before)) continue;
        if (low >= 30000 && high <= 1000000) return `${usd(low)} – ${usd(high)}`;
        const after = description.slice(m.index + m[0].length, m.index + m[0].length + 24);
        if (low >= 10 && high <= 300 && (HOURLY_AFTER_RE.test(after) || HOURLY_BEFORE_RE.test(before))) {
            return `${usd(low)} – ${usd(high)}/hr`;
        }
    }
    return null;
}

const E_VERIFY_RE = /\be-?verify\b/i;
const E_VERIFY_NEGATED_RE = /\b(?:not|n't)\s+(?:currently\s+)?(?:participat\w+|enrolled|use|using|registered)\b[^.]{0,30}\be-?verify\b/i;

/** True when the posting says the employer uses E-Verify. */
export function detectEVerify(description) {
    if (!description) return false;
    return E_VERIFY_RE.test(description) && !E_VERIFY_NEGATED_RE.test(description);
}

const WORK_MODELS = new Set(['remote', 'hybrid', 'onsite']);

/** All signals for one job. A salary or work model the source gave is kept as is. */
export function extractJobSignals(job) {
    const description = job?.description || '';
    return {
        min_yoe: extractMinYoe(job?.title, description),
        work_model: WORK_MODELS.has(job?.work_model) ? job.work_model : extractWorkModel(job?.location, description),
        salary: job?.salary || extractSalary(description),
        e_verify: detectEVerify(description),
    };
}
