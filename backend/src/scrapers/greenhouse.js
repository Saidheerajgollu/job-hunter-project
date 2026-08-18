/**
 * Greenhouse Job Board Scraper
 * Greenhouse offers a public JSON API for each company's job board.
 * No browser needed — pure HTTP fetch.
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

// Companies known to use Greenhouse job boards
const GREENHOUSE_COMPANIES = [
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

export async function scrapeGreenhouse(filterSenior = true, extraCompanies = []) {
    const jobs = [];
    const polledCompanies = [];
    const allCompanies = [...new Set([...GREENHOUSE_COMPANIES, ...extraCompanies])];

    for (const company of allCompanies) {
        try {
            const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHunterPro/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
                if (resp.status !== 404) console.warn(`⚠️  Greenhouse ${company}: HTTP ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const allJobs = data.jobs || [];
            const companyName = company.charAt(0).toUpperCase() + company.slice(1);
            polledCompanies.push(companyName);

            let companyCount = 0;
            for (const job of allJobs) {
                const title = job.title || '';
                const description = job.content ? job.content.replace(/<[^>]*>/g, '').slice(0, 500) : '';
                const category = classifyCategory(title, description);
                if (!category) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const jobUrl = job.absolute_url || `https://boards.greenhouse.io/${company}/jobs/${job.id}`;
                const location = job.location?.name || 'Remote/Unknown';
                const postedAt = job.updated_at ? new Date(job.updated_at).toISOString() : new Date().toISOString();

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
            await sleep(300); // Be polite to the API
        } catch (err) {
            if (!err.message.includes('404')) {
                console.error(`❌ Greenhouse [${company}]: ${err.message}`);
            }
        }
    }

    return { jobs, polledCompanies };
}
