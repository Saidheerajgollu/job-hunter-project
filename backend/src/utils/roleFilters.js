/**
 * Role chip → title/description keyword patterns.
 * Matching is substring (ILIKE) so "Senior Software Engineer - Infra" matches Software Eng.
 */
export const ROLE_TITLE_KEYWORDS = {
    swe: [
        'software engineer',
        'software developer',
        'software eng',
        'software programmer',
        'applications engineer',
        'application developer',
        'embedded engineer',
        'firmware engineer',
        'systems engineer',
        'systems developer',
    ],
    frontend: [
        'frontend engineer',
        'frontend developer',
        'front-end engineer',
        'front-end developer',
        'front end engineer',
        'front end developer',
        'ui engineer',
        'ui developer',
        'ux engineer',
        'ui/ux',
        'ux/ui',
        'ui designer',
        'ux designer',
        'react engineer',
        'react developer',
        'vue engineer',
        'angular engineer',
        'javascript engineer',
        'typescript engineer',
        'web developer',
        'web engineer',
        'mobile engineer',
        'mobile developer',
        'ios engineer',
        'android engineer',
    ],
    backend: [
        'backend engineer',
        'backend developer',
        'back-end engineer',
        'back-end developer',
        'back end engineer',
        'back end developer',
        'api engineer',
        'server-side engineer',
        'server side engineer',
        'server engineer',
        'distributed systems engineer',
        'java engineer',
        'golang engineer',
        'go engineer',
        'rust engineer',
        'python engineer',
        'node.js engineer',
        'nodejs engineer',
    ],
    fullstack: [
        'full stack',
        'full-stack',
        'fullstack',
    ],
    ai: [
        'ai engineer',
        'ai/ml engineer',
        'ai-ml engineer',
        'llm engineer',
        'genai engineer',
        'generative ai engineer',
        'nlp engineer',
        'computer vision engineer',
        'prompt engineer',
        'applied ai engineer',
        'ai research engineer',
    ],
    ml: [
        'machine learning engineer',
        'ml engineer',
        'ml ops engineer',
        'mlops engineer',
        'deep learning engineer',
        'ml platform engineer',
        'ml infrastructure engineer',
        'research engineer',
        'research scientist',
    ],
    'data-science': [
        'data scientist',
        'data science',
        'applied scientist',
        'quantitative analyst',
        'quantitative researcher',
        'quant researcher',
        'statistical analyst',
        'decision scientist',
    ],
    'data-engineer': [
        'data engineer',
        'analytics engineer',
        'data platform engineer',
        'data infrastructure engineer',
        'etl engineer',
        'data pipeline engineer',
        'big data engineer',
    ],
    'data-analyst': [
        'data analyst',
        'business intelligence analyst',
        'bi analyst',
        'bi developer',
        'analytics analyst',
        'insights analyst',
        'reporting analyst',
        'product analyst',
        'power bi developer',
        'tableau developer',
        'looker developer',
    ],
    devops: [
        'devops engineer',
        'devops',
        'site reliability engineer',
        ' sre ',
        'sre,',
        'reliability engineer',
        'cloud engineer',
        'platform engineer',
        'infrastructure engineer',
        'devsecops',
        'kubernetes engineer',
        'cloud architect',
    ],
};

/** Experience chip → title/description patterns (years of experience). */
export const EXPERIENCE_KEYWORDS = {
    '1': [
        '1 year', '1+ year', '1-2 year', '0-1 year', 'one year',
        'entry level', 'entry-level', 'junior', 'new grad', 'new graduate',
        'associate engineer', 'early career', '0-2 year',
    ],
    '2': [
        '2 year', '2+ year', '1-2 year', '2-3 year', 'two year',
    ],
    '3': [
        '3 year', '3+ year', '2-3 year', '3-4 year', 'three year', 'mid level', 'mid-level',
    ],
    '4': [
        '4 year', '4+ year', '3-4 year', '4-5 year', 'four year',
    ],
    '5': [
        '5+ year', '5 year', '6+ year', '7+ year', '8+ year', '10+ year',
        'five year', 'senior ', ' staff ', 'principal ', 'lead engineer', 'lead developer',
    ],
};

/** Location substrings that indicate non-US — used in SQL ILIKE NOT filters. */
export const NON_US_LOCATION_PATTERNS = [
    '%united kingdom%',
    '%great britain%',
    '%remote in uk%',
    '%uk only%',
    '%, uk%',
    '%| uk%',
    '%canada only%',
    '%canada-only%',
    '%, canada%',
    '%toronto%',
    '%vancouver%',
    '%montreal%',
    '%germany%',
    '%france%',
    '%netherlands%',
    '%ireland%',
    '%dublin%',
    '%india only%',
    '%india-only%',
    '%singapore%',
    '%australia%',
    '%europe%',
    '%european%',
    '%emea%',
    '%apac%',
    '%latam%',
    '%brazil%',
    '%mexico city%',
    '%warsaw%',
    '%berlin%',
    '%munich%',
    '%krakow%',
    '%kraków%',
];

/** Hide US-citizenship-only jobs (F-1 can still see roles that don't sponsor). */
export const CITIZENSHIP_BLOCKED_PATTERNS = [
    '%us citizen%',
    '%u.s. citizen%',
    '%us citizenship%',
    '%u.s. citizenship%',
    '%united states citizen%',
    '%citizenship required%',
    '%must be a citizen%',
    '%citizens only%',
    '%security clearance required%',
    '%top secret clearance%',
    '%active secret clearance%',
];

/** Default role keywords for watchlist matching — same chips as the job feed. */
export const DEFAULT_WATCH_ROLES = [...new Set(Object.values(ROLE_TITLE_KEYWORDS).flat())];
export const DEFAULT_WATCH_ROLES_JSON = JSON.stringify(DEFAULT_WATCH_ROLES);

export function matchesTechWatchRole(title, watchRolesJson) {
    const t = (title || '').toLowerCase();
    let keywords = DEFAULT_WATCH_ROLES;
    if (watchRolesJson) {
        try {
            const parsed = JSON.parse(watchRolesJson);
            if (Array.isArray(parsed) && parsed.length) keywords = parsed;
        } catch { /* use default */ }
    }
    return keywords.some(kw => t.includes(String(kw).toLowerCase().trim()));
}

export function matchesRoleFilter(role, title = '', description = '') {
    const keywords = ROLE_TITLE_KEYWORDS[role];
    if (!keywords?.length) return true;
    const text = `${title} ${description}`.toLowerCase();
    return keywords.some(kw => text.includes(kw.trim().toLowerCase()));
}

function appendIlikeOr(conditions, params, keywords, fields = ['title', 'description']) {
    if (!keywords?.length) return;
    const parts = [];
    for (const kw of keywords) {
        const pattern = `%${kw.trim()}%`;
        for (const field of fields) {
            params.push(pattern);
            const col = field === 'description'
                ? `COALESCE(description, '')`
                : field;
            parts.push(`${col} ILIKE $${params.length}`);
        }
    }
    if (parts.length) conditions.push(`(${parts.join(' OR ')})`);
}

/**
 * Build dynamic WHERE clause + params for job listing queries.
 */
export function buildJobQueryFilters({
    status,
    role,
    source,
    search,
    fresh_only,
    has_salary,
    max_age_days,
    experience,
    us_only = true,
}) {
    const conditions = [];
    const params = [];

    // Closed listings drop out of the default feed — a user who already
    // saved or applied keeps seeing their own history, badged as closed
    // by the frontend instead of vanishing.
    conditions.push(`(closed_at IS NULL OR status IN ('saved', 'applied'))`);

    if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
    }

    if (role && ROLE_TITLE_KEYWORDS[role]) {
        appendIlikeOr(conditions, params, ROLE_TITLE_KEYWORDS[role]);
    }

    if (source) {
        params.push(source);
        conditions.push(`source = $${params.length}`);
    }

    if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        conditions.push(`(title ILIKE $${idx} OR company ILIKE $${idx})`);
    }

    if (fresh_only) {
        conditions.push(`scraped_at >= now() - interval '24 hours'`);
    }

    if (has_salary) {
        conditions.push(`salary IS NOT NULL AND salary <> ''`);
    }

    if (max_age_days > 0) {
        params.push(max_age_days);
        conditions.push(`scraped_at >= now() - make_interval(days => $${params.length}::int)`);
    }

    if (experience && EXPERIENCE_KEYWORDS[experience]) {
        appendIlikeOr(conditions, params, EXPERIENCE_KEYWORDS[experience]);
    }

    if (us_only) {
        for (const pattern of NON_US_LOCATION_PATTERNS) {
            params.push(pattern);
            conditions.push(`COALESCE(location, '') NOT ILIKE $${params.length}`);
        }
        // Exclude US-citizenship-only roles from title + description
        for (const pattern of CITIZENSHIP_BLOCKED_PATTERNS) {
            params.push(pattern);
            const idx = params.length;
            conditions.push(`title NOT ILIKE $${idx}`);
            params.push(pattern);
            conditions.push(`COALESCE(description, '') NOT ILIKE $${params.length}`);
        }
    }

    const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
    return { where, params };
}
