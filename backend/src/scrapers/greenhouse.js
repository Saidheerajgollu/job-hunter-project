/**
 * Greenhouse Job Board Scraper
 * Greenhouse offers a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory, mapWithConcurrency, toIsoDate } from '../utils/helpers.js';

// Companies known to use Greenhouse job boards
export const GREENHOUSE_COMPANIES = [
    // AI / ML / Research
    'openai', 'anthropic', 'cohere', 'scale', 'huggingface', 'stability',
    'adept', 'inflection', 'perplexity', 'together', 'character',
    'imbue', 'contextual', 'arcee', 'mistral', 'xai', 'runway',
    'anyscale', 'modal', 'weights-biases',
    // Semiconductor / Hardware (AI chips — strong OPT sponsorship)
    'tenstorrent',             // full-time roles
    'tenstorrentuniversity',   // university / internship board
    'groq', 'cerebras', 'sifive', 'rivos', 'sambanova', 'graphcore',
    // Big Tech / Platform
    'stripe', 'figma', 'notion', 'airtable', 'dropbox', 'asana', 'zendesk',
    'shopify', 'pinterest', 'reddit', 'discord', 'twitch', 'snap', 'roblox',
    // Data / Cloud / Infra
    'databricks', 'snowflake', 'dbt', 'fivetran', 'airbyte',
    'confluent', 'gitlab', 'digitalocean', 'fastly', 'pagerduty',
    'okta', 'elastic', 'hashicorp', 'pulumi', 'grafana', 'buildkite',
    // SWE / Fintech
    'airbnb', 'lyft', 'doordash', 'robinhood', 'brex', 'plaid', 'gusto',
    'coinbase', 'chime', 'affirm', 'carta', 'ramp', 'mercury', 'deel',
    'adyen', 'marqeta', 'nerdwallet',
    // Startup / B2B SaaS
    'cloudflare', 'datadog', 'mongodb', 'twilio', 'palantir',
    'benchling', 'lattice', 'rippling', 'remote',
    'sourcegraph', 'posthog', 'retool', 'vercel', 'coda', 'linear',
    'clickup', 'loom', 'miro',
    // Robotics / Autonomous / Defense
    'anduril', 'shield-ai', 'joby', 'archer', 'nuro', 'zoox', 'aurora', 'motional',
    // Biotech / Health Tech
    'tempus', 'flatiron', 'veeva', 'doximity', 'oscar', 'cityblock',
    // Quant / Finance
    'jane-street', 'tower-research', 'hudson-river-trading', 'citadel',
    // Aerospace
    'spacex',
    // Seattle / Bellevue OPT-friendly
    'expedia', 'docusign', 'smartsheet', 'avalara',
    'watchguard', 'f5', 'nintex', 'allenai', 'vastdata',
    'adaptivebiotech', 'qumulo', 'remitly', 'redfin', 'rover',
    'offerup', 'convoy', 'shippo', 'vacasa', 'porch',
    'accolade', 'sana', 'apixio', 'outreach', 'highspot',
    'icertis', 'wpengine', 'hiya', 'outrider', 'saildrone', 'helion',
    'jobber', 'boundless', 'pushpay', 'wellsky', 'medbridge',
    // NYC OPT-friendly
    'bloomberg', 'betterment', 'squarespace', 'etsy', 'vimeo',
    'foursquare', 'warby-parker', 'nerdwallet',
    // Bay Area additional
    'replit', 'sentry', 'notion', 'benchling',
];

const CONCURRENCY = 8; // boards fetched in parallel — sequential took 10+ min per poll

/**
 * options (used by the 6-hourly wide sweep over the public ATS directory):
 *   includeSeed  — also poll the hand-picked list above (default true)
 *   concurrency  — boards in flight; this API is one host, so stay ≤ 8
 *   withContent  — fetch descriptions (much larger payloads; default true)
 */
export async function scrapeGreenhouse(filterSenior = true, extraCompanies = [], { includeSeed = true, withContent = true, concurrency = CONCURRENCY } = {}) {
    const jobs = [];
    const polledCompanies = [];
    const seenUrls = [];
    const allCompanies = [...new Set([...(includeSeed ? GREENHOUSE_COMPANIES : []), ...extraCompanies])];

    await mapWithConcurrency(allCompanies, concurrency, async (company) => {
        try {
            const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs${withContent ? '?content=true' : ''}`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(20000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️  Greenhouse ${company}: HTTP ${resp.status}`);
                return;
            }

            const data = await resp.json();
            const allJobs = data.jobs || [];
            // Slug-derived name ("Hudson-river-trading") is what older rows were
            // stored under; prefer the board's real name when it's provided.
            const legacyName = company.charAt(0).toUpperCase() + company.slice(1);
            const companyName = allJobs.find(j => j.company_name)?.company_name || legacyName;
            polledCompanies.push(companyName);
            if (legacyName !== companyName) polledCompanies.push(legacyName);

            let companyCount = 0;
            for (const job of allJobs) {
                const jobUrl = job.absolute_url || `https://boards.greenhouse.io/${company}/jobs/${job.id}`;
                seenUrls.push(jobUrl);

                const title = job.title || '';
                const description = job.content ? decodeEntities(job.content).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const location = job.location?.name || 'Remote/Unknown';
                // first_published is when the role went live; updated_at moves on
                // every edit, which made edited listings look like reposts.
                const postedAt = toIsoDate(job.first_published || job.updated_at);

                jobs.push({
                    id: makeJobId(jobUrl),
                    title,
                    company: companyName,
                    location,
                    url: jobUrl,
                    source: 'greenhouse',
                    category,
                    salary: null,
                    description: description || null,
                    posted_at: postedAt,
                });
                companyCount++;
            }

            if (allJobs.length > 0) {
                console.log(`✅ Greenhouse [${company}]: ${companyCount} tech roles (${allJobs.length} total)`);
            }
            await sleep(100); // Be polite to the API
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Greenhouse [${company}]: ${err.message}`);
            }
        }
    });

    return { jobs, polledCompanies, seenUrls };
}

/** Greenhouse `content` is HTML-escaped HTML ("&lt;p&gt;..."); unescape before stripping tags. */
function decodeEntities(str) {
    return str
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
