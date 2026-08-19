#!/usr/bin/env node
/**
 * Discover new watchlist-worthy companies from Web Data Commons' schema.org
 * JobPosting extract (an annual dataset derived from Common Crawl).
 *
 * WDC publishes a pre-aggregated domain_stats.csv listing every domain that
 * had JobPosting structured data, with how many distinct postings were
 * found — no need to download the multi-GB raw N-Quads files for this.
 * Most of that domain list is job boards/aggregators, not individual
 * companies, so this script uses the project's existing detectATS() as the
 * real quality gate: only domains that resolve to a real, supported ATS
 * (including the schema-org tier) become candidates. Output is a new
 * preset file, in the exact shape of the existing regional presets, so it
 * plugs into the existing bulk-import flow with no new UI/API surface.
 *
 * This is a slow, network-heavy, one-off script — not part of the server.
 * Usage: node scripts/discover-companies-from-wdc.js [--limit=300] [--min-entities=5]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseDomainStats, selectCandidateDomains } from '../src/utils/wdcDiscovery.js';
import { detectATS } from '../src/utils/atsDetector.js';
import { SEATTLE_COMPANIES } from '../src/presets/seattleCompanies.js';
import { NYC_COMPANIES } from '../src/presets/nycCompanies.js';
import { BAY_AREA_COMPANIES } from '../src/presets/bayAreaCompanies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOMAIN_STATS_URL =
    'https://data.dws.informatik.uni-mannheim.de/structureddata/2024-12/quads/classspecific/JobPosting/JobPosting_domain_stats.csv';

const OUTPUT_PATH = path.join(__dirname, '../src/presets/wdcDiscoveredCompanies.js');

const DETECT_DELAY_MS = 400; // be polite to Greenhouse/Lever/Ashby/etc. probe endpoints

// detectATS()'s own `supported` field also counts bare 'custom' pages as
// supported (a reasonable default for its original use case — a human
// reviewing and choosing to add a company anyway) — but for unattended bulk
// discovery that's too weak a filter: 'custom' means no real structured
// monitoring capability was found at all, just some page that responded.
// This script requires an actual recognized ATS (or the schema-org tier).
const REAL_ATS_TYPES = new Set([
    'greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'recruitee', 'schema-org',
]);

function parseArgs(argv) {
    const limitArg = argv.find(a => a.startsWith('--limit='));
    const minEntitiesArg = argv.find(a => a.startsWith('--min-entities='));
    return {
        limit: limitArg ? Number(limitArg.split('=')[1]) : 300,
        minEntities: minEntitiesArg ? Number(minEntitiesArg.split('=')[1]) : 5,
    };
}

function knownDomainSet() {
    const known = new Set();
    for (const company of [...SEATTLE_COMPANIES, ...NYC_COMPANIES, ...BAY_AREA_COMPANIES]) {
        if (company.domain) known.add(company.domain);
    }
    return known;
}

function nameFromDomain(domain) {
    const base = domain.replace(/\.(com|io|ai|co|net|org|us|de|ru|jp|uk)$/i, '');
    return base
        .split(/[.-]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function formatCompany(c) {
    const parts = [
        `name: '${c.name.replace(/'/g, "\\'")}'`,
        `domain: '${c.domain}'`,
        `career_url: ${c.career_url ? `'${c.career_url}'` : 'null'}`,
        `ats_type: '${c.ats_type}'`,
        `ats_slug: ${c.ats_slug ? `'${c.ats_slug}'` : 'null'}`,
        `category: 'wdc-discovered'`,
    ];
    return `    { ${parts.join(', ')} }`;
}

async function main() {
    const { limit, minEntities } = parseArgs(process.argv.slice(2));

    console.log(`⬇️  Fetching ${DOMAIN_STATS_URL} ...`);
    const resp = await fetch(DOMAIN_STATS_URL, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) throw new Error(`WDC domain_stats fetch failed: HTTP ${resp.status}`);
    const csv = await resp.text();

    const domainStats = parseDomainStats(csv);
    console.log(`📊 Parsed ${domainStats.length} domains from WDC's JobPosting extract`);

    const known = knownDomainSet();
    const candidates = selectCandidateDomains(domainStats, known, { minEntities, limit });
    console.log(`🔍 ${candidates.length} new candidate domains (min ${minEntities} postings, not already in a preset) — probing each for a supported ATS...`);

    const discovered = [];
    let checked = 0;

    for (const { domain, entityCount } of candidates) {
        checked++;
        try {
            const name = nameFromDomain(domain);
            const result = await detectATS(name, domain);
            if (REAL_ATS_TYPES.has(result.ats_type)) {
                discovered.push({
                    name,
                    domain,
                    career_url: result.career_url,
                    ats_type: result.ats_type,
                    ats_slug: result.ats_slug,
                });
                console.log(`✅ [${checked}/${candidates.length}] ${domain} (${entityCount} postings) → ${result.ats_type}`);
            } else {
                console.log(`⏭️  [${checked}/${candidates.length}] ${domain} — no supported ATS found`);
            }
        } catch (err) {
            console.log(`⚠️  [${checked}/${candidates.length}] ${domain} — ${err.message}`);
        }
        await new Promise(r => setTimeout(r, DETECT_DELAY_MS));
    }

    const body = discovered.map(formatCompany).join(',\n');
    const fileContent = `/**
 * Companies discovered from Web Data Commons' schema.org JobPosting extract
 * (https://webdatacommons.org/structureddata/) that resolve to a supported
 * ATS. Generated by scripts/discover-companies-from-wdc.js — do not hand-edit;
 * re-run the script to refresh.
 */

export const WDC_DISCOVERED_COMPANIES = [
${discovered.length > 0 ? body + ',' : ''}
];

export const WDC_DISCOVERED_PRESET = {
    id: 'wdc-discovered',
    label: \`WDC Discovered (\${WDC_DISCOVERED_COMPANIES.length})\`,
    description: 'Companies found via Web Data Commons\\' schema.org job-posting data, verified against a supported ATS.',
    companies: WDC_DISCOVERED_COMPANIES,
};
`;

    fs.writeFileSync(OUTPUT_PATH, fileContent);
    console.log(`\n✅ Wrote ${discovered.length} discovered companies to ${OUTPUT_PATH}`);
}

main().catch(err => {
    console.error('💥 Discovery script failed:', err);
    process.exit(1);
});
