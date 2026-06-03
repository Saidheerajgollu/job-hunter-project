/**
 * We Work Remotely Scraper
 * Free RSS feeds — no key required.
 * Covers Programming, DevOps/SysAdmin, and Data Science remote roles.
 */

import { makeJobId, isSeniorRole, sleep, classifyCategory } from '../utils/helpers.js';

const FEEDS = [
    { url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',           label: 'Programming' },
    { url: 'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',       label: 'DevOps' },
    { url: 'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss', label: 'Full Stack' },
];

function extractCDATA(tag, xml) {
    const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
    if (m) return m[1].trim();
    const m2 = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return m2 ? m2[1].replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&gt;/g, '>').trim() : '';
}

function parseRSSItems(xml) {
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    return itemBlocks.map(block => {
        const fullTitle = extractCDATA('title', block); // "Company: Job Title"
        const colonIdx = fullTitle.indexOf(': ');
        const company = colonIdx > -1 ? fullTitle.slice(0, colonIdx).trim() : 'Unknown';
        const title   = colonIdx > -1 ? fullTitle.slice(colonIdx + 2).trim() : fullTitle;

        const rawLink = extractCDATA('link', block) || block.match(/<link>(.*?)<\/link>/)?.[1] || '';
        // WWR link is sometimes after </link> tag — try guid as fallback
        const guid = extractCDATA('guid', block);
        const url = rawLink.startsWith('http') ? rawLink : guid;

        const rawDesc = extractCDATA('description', block);
        const description = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

        const pubDate = extractCDATA('pubDate', block);

        return { title, company, url, description, pubDate };
    });
}

export async function scrapeWeWorkRemotely(filterSenior = true) {
    const jobs = [];

    for (const feed of FEEDS) {
        try {
            const resp = await fetch(feed.url, {
                headers: { 'User-Agent': 'JobHunterPro/1.0' },
                signal: AbortSignal.timeout(12000),
            });

            if (!resp.ok) {
                console.warn(`⚠️  WWR [${feed.label}]: HTTP ${resp.status}`);
                continue;
            }

            const xml = await resp.text();
            const items = parseRSSItems(xml);

            for (const { title, company, url, description, pubDate } of items) {
                if (!title || !url) continue;
                if (filterSenior && isSeniorRole(title)) continue;

                const category = classifyCategory(title, description);
                if (!category) continue;

                jobs.push({
                    id: makeJobId(url),
                    title,
                    company,
                    location: 'Remote',
                    url,
                    source: 'weworkremotely',
                    category,
                    salary: null,
                    description: description || null,
                    posted_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                });
            }

            console.log(`✅ WWR [${feed.label}]: ${items.length} items`);
            await sleep(400);
        } catch (err) {
            console.error(`❌ WWR [${feed.label}]: ${err.message}`);
        }
    }

    return jobs;
}
