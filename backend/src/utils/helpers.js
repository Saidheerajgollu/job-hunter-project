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
