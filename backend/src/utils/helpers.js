import crypto from 'crypto';

/**
 * Generate a stable ID for a job based on its URL
 */
export function makeJobId(url) {
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * Parse a "time ago" string into an ISO date string
 * e.g. "2 hours ago" → ISO string
 */
export function parsePostedAt(text, fallback = new Date().toISOString()) {
    if (!text) return fallback;
    const now = new Date();
    const lower = text.toLowerCase().trim();

    const patterns = [
        { regex: /(\d+)\s*minute/, unit: 'minutes' },
        { regex: /(\d+)\s*hour/, unit: 'hours' },
        { regex: /(\d+)\s*day/, unit: 'days' },
        { regex: /(\d+)\s*week/, unit: 'weeks' },
        { regex: /(\d+)\s*month/, unit: 'months' },
    ];

    for (const { regex, unit } of patterns) {
        const m = lower.match(regex);
        if (m) {
            const n = parseInt(m[1]);
            const ms = { minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000, months: 2592000000 }[unit];
            return new Date(now.getTime() - n * ms).toISOString();
        }
    }

    // Try direct date parse
    const d = new Date(text);
    return isNaN(d) ? fallback : d.toISOString();
}

/**
 * Check if a job title looks like a senior/experienced-only role
 */
export function isSeniorRole(title) {
    const seniorKeywords = [
        'senior', 'staff', 'principal', 'lead', 'manager', 'director',
        'vp ', 'vice president', 'head of', 'architect', 'distinguished',
        '5+ years', '7+ years', '10+ years',
    ];
    const lower = title.toLowerCase();
    return seniorKeywords.some(kw => lower.includes(kw));
}

/**
 * Classify a job title into a granular CS category.
 * Order matters — more specific checks run first.
 * Categories: ai | ml | fullstack | data-science | data-engineer | data-analyst | devops | swe
 *
 * Pass description as second arg to improve accuracy for ambiguous titles.
 */
export function classifyCategory(title, description = '') {
    const t = title.toLowerCase().trim();
    // Use description only as a secondary signal (first 300 chars to avoid noise)
    const d = description ? description.toLowerCase().slice(0, 300) : '';

    // ── AI Engineer — LLM, GenAI, NLP, Computer Vision ──────────────────────────
    // Check title-only first with strong signals
    if (/\b(ai engineer|llm engineer|gen(erative)?[\s\-]?ai engineer|genai engineer|computer vision engineer|cv engineer|nlp engineer|natural language processing engineer|conversational ai|multimodal engineer|vision[\s\-]language|foundation model engineer|prompt engineer)\b/.test(t)) return 'ai';
    if (/\b(ai\/ml engineer|ml\/ai engineer|ai[\s\-]ml engineer|ai research engineer|applied ai engineer)\b/.test(t)) return 'ai';
    // Broad title-level AI signal (llm, genai, nlp as standalone role descriptor)
    if (/\b(llm|genai|generative ai|large language model|computer vision|nlp)\b/.test(t) && /\b(engineer|developer|researcher|scientist|specialist)\b/.test(t)) return 'ai';

    // ── ML Engineer — model training, deep learning, MLOps ──────────────────────
    if (/\b(machine learning engineer|ml engineer|ml platform engineer|ml infrastructure engineer|ml ops engineer|mlops engineer|deep learning engineer)\b/.test(t)) return 'ml';
    if (/\b(research engineer|research scientist|applied researcher|reinforcement learning engineer)\b/.test(t)) return 'ml';
    if (/\b(model training|model deployment|model serving|feature engineering|model fine.?tun)\b/.test(t)) return 'ml';
    if (/\b(mlops|ml platform|ml infrastructure|ml ops)\b/.test(t)) return 'ml';
    // ML via tech stack in title (e.g. "PyTorch Engineer")
    if (/\b(pytorch|tensorflow|jax)\b/.test(t) && /\b(engineer|developer|researcher)\b/.test(t)) return 'ml';

    // ── Full Stack ───────────────────────────────────────────────────────────────
    if (/\bfull[\s\-]?stack\b/.test(t)) return 'fullstack';

    // ── Data Science ─────────────────────────────────────────────────────────────
    if (/\b(data scien(tist|ce)|applied scien(tist|ce))\b/.test(t)) return 'data-science';
    if (/\b(quantitative (analyst|researcher|developer|engineer|trader)|quant (researcher|analyst|developer|trader))\b/.test(t)) return 'data-science';
    if (/\b(statistical (analyst|modeler|researcher)|econometr|biostatistic|actuarial)\b/.test(t)) return 'data-science';
    if (/\b(research analyst|applied analytics|decision scien)\b/.test(t)) return 'data-science';

    // ── Data Engineer ────────────────────────────────────────────────────────────
    if (/\b(data engineer|analytics engineer|data platform engineer|data infrastructure engineer)\b/.test(t)) return 'data-engineer';
    if (/\b(etl engineer|data pipeline|data warehouse engineer|lakehouse engineer)\b/.test(t)) return 'data-engineer';
    if (/\b(streaming engineer|kafka engineer|spark engineer|big data engineer)\b/.test(t)) return 'data-engineer';
    // Common data engineering tools as primary role indicator
    if (/\b(airflow|dbt|apache spark|apache kafka|apache beam|databricks engineer|snowflake engineer)\b/.test(t) && /\b(engineer|developer|architect)\b/.test(t)) return 'data-engineer';

    // ── Data Analyst ─────────────────────────────────────────────────────────────
    if (/\b(data analyst|business intelligence analyst|bi analyst|bi developer|bi engineer)\b/.test(t)) return 'data-analyst';
    if (/\b(analytics analyst|insights analyst|reporting analyst|sql analyst|product analyst)\b/.test(t)) return 'data-analyst';
    if (/\b(marketing analyst|operations analyst|growth analyst|strategy analyst|financial analyst)\b/.test(t)) return 'data-analyst';
    // BI tools as primary title signal
    if (/\b(tableau developer|looker developer|power bi developer)\b/.test(t)) return 'data-analyst';

    // ── DevOps / Cloud / Platform / SRE / Security ───────────────────────────────
    if (/\b(devops engineer|site reliability engineer|sre\b|reliability engineer)\b/.test(t)) return 'devops';
    if (/\b(cloud engineer|platform engineer|infrastructure engineer|devsecops engineer)\b/.test(t)) return 'devops';
    if (/\b(network engineer|security engineer|cybersecurity engineer|information security engineer)\b/.test(t)) return 'devops';
    if (/\b(kubernetes engineer|cloud architect|systems reliability|build engineer)\b/.test(t)) return 'devops';

    // ── Frontend / UI-UX ───────────────────────────────────────────────────────────
    if (/\b(front[\s\-]?end engineer|front[\s\-]?end developer|frontend engineer|frontend developer)\b/.test(t)) return 'frontend';
    if (/\b(ui engineer|ui developer|ux engineer|web developer|web engineer)\b/.test(t)) return 'frontend';
    if (/\b(ui\/ux|ux\/ui)\b/.test(t) && /\b(designer|engineer|developer|design)\b/.test(t)) return 'frontend';
    if (/\b(ux designer|ui designer|product designer|visual designer|interaction designer)\b/.test(t)) return 'frontend';
    if (/\b(react (engineer|developer)|vue (engineer|developer)|angular (engineer|developer)|svelte (engineer|developer))\b/.test(t)) return 'frontend';
    if (/\b(javascript engineer|typescript engineer|next\.?js engineer|nuxt engineer)\b/.test(t)) return 'frontend';
    if (/\b(ios engineer|ios developer|android engineer|android developer|mobile engineer|mobile developer|flutter engineer|react native engineer)\b/.test(t)) return 'frontend';

    // ── Backend Engineer ──────────────────────────────────────────────────────────
    if (/\b(back[\s\-]?end engineer|back[\s\-]?end developer|backend engineer|backend developer)\b/.test(t)) return 'backend';
    if (/\b(api engineer|server[\s\-]?side engineer|server engineer|distributed systems engineer)\b/.test(t)) return 'backend';
    if (/\b(java engineer|java developer|golang engineer|go engineer|rust engineer|python engineer|ruby engineer|rails engineer|node\.?js engineer|scala engineer|c\+\+ engineer|c# engineer|\.net engineer|php engineer)\b/.test(t)) return 'backend';
    if (/\b(microservices engineer|distributed systems|systems programmer)\b/.test(t)) return 'backend';

    // ── Explicit SWE — must match before falling through to null ─────────────────
    // Only real engineering/developer/programmer titles qualify
    if (/\b(software engineer|software developer|software programmer|swe\b|sde\b)\b/.test(t)) return 'swe';
    if (/\b(applications? engineer|application developer|engineer (i|ii|iii|iv|1|2|3))\b/.test(t)) return 'swe';
    if (/\b(embedded engineer|embedded developer|firmware engineer|systems engineer|systems developer)\b/.test(t)) return 'swe';
    if (/\b(game engineer|game developer|graphics engineer|simulation engineer)\b/.test(t)) return 'swe';
    if (/\b(new grad.*engineer|engineer.*new grad|entry[\s\-]level engineer)\b/.test(t)) return 'swe';

    // ── Use description as tiebreaker for ambiguous generic titles ────────────────
    if (d) {
        if (/\b(llm|generative ai|large language model|computer vision|nlp engineer|natural language)\b/.test(d)) return 'ai';
        if (/\b(machine learning|deep learning|model training|mlops|neural network|reinforcement learning)\b/.test(d)) return 'ml';
        if (/\b(data scientist|data science|statistical model|applied scientist)\b/.test(d)) return 'data-science';
        if (/\b(data engineer|etl|data pipeline|apache spark|airflow|kafka)\b/.test(d)) return 'data-engineer';
        if (/\b(data analyst|business intelligence|tableau|looker|power bi)\b/.test(d)) return 'data-analyst';
        if (/\b(devops|kubernetes|infrastructure|site reliability|cloud platform)\b/.test(d)) return 'devops';
        if (/\b(front[\s\-]?end|react|vue|angular|javascript|typescript|ui engineer|css|html)\b/.test(d)) return 'frontend';
        if (/\b(back[\s\-]?end|api|server[\s\-]?side|microservice|java |golang|node\.?js|ruby|rails|postgres|mysql|redis)\b/.test(d)) return 'backend';
        if (/\b(software engineer|software developer|coding|programming|computer science)\b/.test(d)) return 'swe';
    }

    // ── Not a tech role — exclude from results ────────────────────────────────────
    return null;
}


/** Countries/regions/cities that indicate a non-US job (word-boundary matched). */
export const NON_US_LOCATION_TERMS = [
    // Regions
    'europe', 'european', 'emea', 'apac', 'latam', 'mena', 'africa', 'middle east', 'asia pacific',
    'eu only', 'eu-only', 'uk only', 'uk-only', 'canada only', 'canada-only', 'india only', 'india-only',
    'remote in uk', 'remote in europe', 'remote in india', 'remote in canada',
    // UK
    'united kingdom', 'great britain', 'england', 'scotland', 'wales', 'cambridgeshire',
    'london', 'manchester', 'edinburgh', 'glasgow', 'bristol', 'leeds', 'cardiff', 'birmingham',
    // Europe
    'switzerland', 'zurich', 'geneva', 'italy', 'milan', 'rome', 'florence', 'turin',
    'germany', 'berlin', 'munich', 'frankfurt', 'hamburg', 'france', 'paris', 'lyon',
    'netherlands', 'amsterdam', 'rotterdam', 'spain', 'madrid', 'barcelona', 'portugal', 'lisbon',
    'ireland', 'dublin', 'belgium', 'brussels', 'austria', 'vienna', 'sweden', 'stockholm',
    'norway', 'oslo', 'denmark', 'copenhagen', 'finland', 'helsinki', 'poland', 'warsaw', 'krakow', 'kraków',
    'czech', 'prague', 'romania', 'bucharest', 'hungary', 'budapest', 'greece', 'athens',
    'ukraine', 'kyiv', 'kiev', 'russia', 'moscow',
    // Americas (non-US)
    'canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary',
    'mexico', 'brazil', 'sao paulo', 'são paulo', 'argentina', 'buenos aires', 'chile', 'santiago',
    'colombia', 'bogota', 'bogotá', 'peru', 'lima', 'costa rica',
    // Asia-Pacific
    'india', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'pune',
    'gurgaon', 'gurugram', 'noida', 'kolkata', 'ahmedabad', 'jaipur',
    'china', 'beijing', 'shanghai', 'shenzhen', 'guangzhou',
    'japan', 'tokyo', 'osaka', 'south korea', 'seoul', 'singapore', 'hong kong',
    'taiwan', 'taipei', 'australia', 'sydney', 'melbourne', 'brisbane', 'new zealand', 'auckland',
    'philippines', 'manila', 'vietnam', 'ho chi minh', 'hanoi', 'thailand', 'bangkok',
    'indonesia', 'jakarta', 'malaysia', 'kuala lumpur', 'pakistan', 'karachi', 'lahore',
    'bangladesh', 'dhaka', 'sri lanka', 'nepal',
    // Middle East / Africa
    'israel', 'tel aviv', 'uae', 'dubai', 'abu dhabi', 'saudi arabia', 'riyadh', 'qatar', 'doha',
    'egypt', 'cairo', 'nigeria', 'lagos', 'kenya', 'nairobi', 'south africa', 'johannesburg', 'cape town',
];

const US_STATE_ABBREVS = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';

let _nonUsRegex = null;
function nonUsLocationRegex() {
    if (!_nonUsRegex) {
        const escaped = NON_US_LOCATION_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        _nonUsRegex = new RegExp(`\\b(${escaped})\\b`, 'i');
    }
    return _nonUsRegex;
}

/** PostgreSQL regex for buildJobQueryFilters (word boundaries). */
export function getNonUsLocationPgRegex() {
    const escaped = NON_US_LOCATION_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return `\\m(${escaped})\\M`;
}

function hasUsStateSignal(location = '') {
    return new RegExp(`(,|\\||\\-)\\s*(${US_STATE_ABBREVS})\\s*($|,|\\||\\-)`, 'i').test(location);
}

/**
 * Returns true if the location string is US-compatible.
 * US **location** only — does not require US citizenship (F-1 / OPT friendly).
 */
export function isUSCompatible(location = '') {
    if (!location) return true;

    const loc = location.toLowerCase().trim();

    if (/\b(united states|u\.s\.a?\.?|usa)\b/.test(loc)) return true;
    if (/\b(remote.*\b(us|usa|united states)\b|\b(us|usa|united states)\b.*remote)\b/.test(loc)) return true;
    if (hasUsStateSignal(location)) return true;

    if (nonUsLocationRegex().test(loc)) return false;

    // Legacy substring patterns (multi-word phrases with punctuation)
    const nonUSPhrases = [
        ', canada', ' toronto,', 'vancouver,', 'montreal,',
        'sydney,', 'melbourne,', 'mexico city',
    ];
    if (nonUSPhrases.some(r => loc.includes(r))) return false;

    if (/\blondon\b/.test(loc) && !/\b(london,?\s*(ky|oh|on\b)|united states|, us\b| usa\b)/.test(loc)) return false;

    return true;
}

/** True when a job requires US citizenship or clearance F-1 holders can't get. Sponsorship not required. */
export function isUSCitizenshipRequired(title = '', description = '') {
    const text = `${title} ${description}`.toLowerCase();
    const blocked = [
        'us citizen', 'u.s. citizen', 'us citizenship', 'u.s. citizenship',
        'united states citizen', 'must be a citizen', 'must be a u.s. citizen',
        'citizenship required', 'citizens only', 'citizen only',
        'active secret clearance', 'top secret clearance', 'ts/sci',
        'security clearance required', 'ability to obtain a security clearance',
        'ability to obtain clearance', 'clearance is required',
    ];
    return blocked.some(kw => text.includes(kw));
}

/** Categories shown in the UI role filter chips. */
export const TECH_ROLE_CATEGORIES = [
    'swe', 'frontend', 'backend', 'fullstack', 'ai', 'ml',
    'data-science', 'data-engineer', 'data-analyst', 'devops',
];

/** Search terms for ATS APIs (Workday, etc.) — tech roles only, not new-grad specific. */
export const TECH_SEARCH_TERMS = [
    'software engineer',
    'software developer',
    'frontend engineer',
    'backend engineer',
    'full stack engineer',
    'machine learning engineer',
    'ml engineer',
    'ai engineer',
    'data scientist',
    'data engineer',
    'data analyst',
    'devops engineer',
    'site reliability engineer',
    'mlops engineer',
];

/** True when title/description maps to one of our tech role categories. */
export function isTechRoleJob(title, description = '') {
    return classifyCategory(title, description) !== null;
}

/** Gate before persisting — US-located tech role, not US-citizenship-only. */
export function isEligibleJob(job) {
    if (!job?.category) return false;
    if (!job.url) return false;
    if (!isUSCompatible(job.location)) return false;
    if (isUSCitizenshipRequired(job.title, job.description || '')) return false;
    return true;
}

/**
 * Retry a function up to N times with delay
 */
export async function retry(fn, retries = 3, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            await sleep(delayMs);
        }
    }
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Shuffle an array (Fisher-Yates)
 */
export function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
