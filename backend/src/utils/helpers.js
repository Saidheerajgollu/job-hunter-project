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

    // ── Frontend Engineer ─────────────────────────────────────────────────────────
    if (/\b(front[\s\-]?end engineer|front[\s\-]?end developer|frontend engineer|frontend developer)\b/.test(t)) return 'frontend';
    if (/\b(ui engineer|ui developer|ux engineer|web developer|web engineer)\b/.test(t)) return 'frontend';
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


/**
 * Returns true if the location string is US-compatible.
 * Accepts: US cities/states, "Remote", "Worldwide", "Anywhere", blank.
 * Rejects: Europe, UK, Asia, Canada-only, etc.
 */
export function isUSCompatible(location = '') {
    if (!location) return true; // no restriction = worldwide = fine

    const loc = location.toLowerCase().trim();

    // Explicit non-US regions — reject these
    const nonUS = [
        'europe', 'european', 'eu only', 'eu-only',
        'united kingdom', 'uk only', 'uk-only', ' uk ',
        'canada only', 'canada-only',
        'australia', 'new zealand',
        'asia', 'apac', 'india only', 'india-only',
        'latin america', 'latam',
        'germany', 'france', 'netherlands', 'spain', 'portugal',
        'brazil', 'mexico',
        'africa', 'middle east',
    ];
    if (nonUS.some(r => loc.includes(r))) return false;

    return true; // US cities, "Remote", "Worldwide", "Anywhere", "North America", etc. all pass
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
