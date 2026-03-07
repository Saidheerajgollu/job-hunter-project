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
 */
export function classifyCategory(title, hint = '') {
    const text = (title + ' ' + hint).toLowerCase();

    // ── AI Engineer — LLM, GenAI, NLP, Computer Vision ──────────────────────────
    if (/\b(ai engineer|llm|large language model|generative ai|gen[- ]ai|computer vision|cv engineer|nlp engineer|natural language processing|conversational ai|multimodal)\b/.test(text)) return 'ai';

    // ── ML Engineer — model training, deep learning, MLOps ──────────────────────
    if (/\b(machine learning|ml engineer|deep learning|mlops|model (engineer|deployment)|research engineer|reinforcement learning|pytorch|tensorflow|neural network)\b/.test(text)) return 'ml';

    // ── Full Stack ───────────────────────────────────────────────────────────────
    if (/\bfull[- ]?stack\b/.test(text)) return 'fullstack';

    // ── Data Science ────────────────────────────────────────────────────────────
    if (/\b(data scien(tist|ce)|applied scientist|quantitative analyst|quant researcher|statistical model|biostatistic|actuarial)\b/.test(text)) return 'data-science';

    // ── Data Engineer ────────────────────────────────────────────────────────────
    if (/\b(data engineer|analytics engineer|etl|data pipeline|data platform|data infrastructure|data warehouse|lakehouse|spark engineer|airflow|dbt engineer|streaming engineer|kafka|beam)\b/.test(text)) return 'data-engineer';

    // ── Data Analyst ─────────────────────────────────────────────────────────────
    if (/\b(data analyst|business (intelligence|analyst)|bi (analyst|developer|engineer)|analytics analyst|insights analyst|reporting analyst|tableau|looker|power bi|sql analyst)\b/.test(text)) return 'data-analyst';

    // ── DevOps / Cloud / SRE / Security ─────────────────────────────────────────
    if (/\b(devops|site reliability|sre\b|cloud engineer|platform engineer|infrastructure engineer|kubernetes|docker|ci\/cd|devsecops|cloud architect|network engineer|security engineer|cybersecurity|information security)\b/.test(text)) return 'devops';

    // ── Mobile (falls under SWE for our purposes) ────────────────────────────────
    if (/\b(ios engineer|android engineer|mobile engineer|react native|flutter engineer)\b/.test(text)) return 'swe';

    // ── Default: Software Engineer ───────────────────────────────────────────────
    return 'swe';
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
