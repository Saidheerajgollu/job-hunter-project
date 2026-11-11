/**
 * Jobright's public new-grad and internship lists on GitHub
 * (github.com/jobright-ai). Each repo's README holds one table that Jobright
 * updates daily. Only those READMEs are read; jobright.ai itself is not
 * crawled. Links go to the job's page on jobright.ai, as the lists intend.
 */

import { makeJobId, isSeniorRole, classifyCategory } from '../utils/helpers.js';
import { domainFromUrl } from '../utils/companyDomain.js';
import { extractSalary } from '../utils/jobSignals.js';

const REPOS = [
    '2026-Software-Engineer-New-Grad',
    '2026-Data-Analysis-New-Grad',
    '2026-Software-Engineer-Internship',
    '2026-Data-Analysis-Internship',
];
const readmeUrl = repo => `https://raw.githubusercontent.com/jobright-ai/${repo}/master/README.md`;

const LINK_RE = /\*\*\[(.+)\]\(\s*(\S+?)\s*\)\*\*/;
const WORK_MODELS = { 'on site': 'onsite', 'onsite': 'onsite', 'hybrid': 'hybrid', 'remote': 'remote' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Nov 11" → ISO date. The table has no year: a date in the future belongs to last year. */
function parseListDate(text, now) {
    const m = String(text).trim().match(/^([A-Za-z]{3})\w*\s+(\d{1,2})$/);
    if (!m) return null;
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month < 0) return null;
    let date = new Date(Date.UTC(now.getUTCFullYear(), month, Number(m[2])));
    if (date.getTime() > now.getTime() + 2 * 24 * 60 * 60 * 1000) {
        date = new Date(Date.UTC(now.getUTCFullYear() - 1, month, Number(m[2])));
    }
    return date.toISOString();
}

/** Jobright job link without tracking parameters, or null for any other link. */
function cleanJobUrl(raw) {
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' || u.hostname !== 'jobright.ai' || !u.pathname.startsWith('/jobs/info/')) return null;
        return `https://jobright.ai${u.pathname}`;
    } catch {
        return null;
    }
}

export function parseJobrightReadme(markdown, { now = new Date(), filterSenior = true } = {}) {
    const jobs = [];
    let company = null, companyDomain = null;

    for (const line of String(markdown).split('\n')) {
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length < 5) continue;
        const [companyCell, titleCell, locationCell, modelCell, dateCell] = cells;

        if (companyCell !== '↳') {
            const c = companyCell.match(LINK_RE);
            if (c) { company = c[1].trim(); companyDomain = domainFromUrl(c[2]); }
            else { company = companyCell.replace(/\*/g, '').trim() || null; companyDomain = null; }
        }

        const t = titleCell.match(LINK_RE);
        if (!t || !company) continue;
        const url = cleanJobUrl(t[2]);
        if (!url) continue;

        // Some titles carry the pay range: "… Engineer $60,000-$99,000/annually".
        let title = t[1].trim();
        let salary = null;
        const moneyAt = title.indexOf('$');
        if (moneyAt > 0) {
            salary = extractSalary(title.slice(moneyAt));
            if (salary) title = title.slice(0, moneyAt).trim();
        }

        if (filterSenior && isSeniorRole(title)) continue;
        const category = classifyCategory(title, '');
        if (!category) continue;

        const location = locationCell.replace(/,\s*United States$/i, '').trim() || 'US';

        jobs.push({
            id: makeJobId(`jobright-${url}`),
            title,
            company,
            location,
            url,
            source: 'jobright',
            company_domain: companyDomain,
            category,
            salary,
            description: null,
            work_model: WORK_MODELS[modelCell.toLowerCase()] || null,
            // No date beats a made-up one: "now" would move on every run and look like a repost.
            posted_at: parseListDate(dateCell, now),
        });
    }
    return jobs;
}

export async function scrapeJobright(filterSenior = true) {
    console.log('🔍 Jobright: fetching public GitHub lists...');
    const byUrl = new Map();
    for (const repo of REPOS) {
        try {
            const resp = await fetch(readmeUrl(repo), {
                headers: { 'User-Agent': 'JobHunterPro/1.0 (github.com/Saidheerajgollu/job-hunter-project)' },
                signal: AbortSignal.timeout(30000),
            });
            if (!resp.ok) {
                console.error(`❌ Jobright ${repo}: HTTP ${resp.status}`);
                continue;
            }
            for (const job of parseJobrightReadme(await resp.text(), { filterSenior })) {
                if (!byUrl.has(job.url)) byUrl.set(job.url, job);
            }
        } catch (err) {
            console.error(`❌ Jobright ${repo}: ${err.message}`);
        }
    }
    console.log(`✅ Jobright: ${byUrl.size} tech jobs found`);
    return [...byUrl.values()];
}
