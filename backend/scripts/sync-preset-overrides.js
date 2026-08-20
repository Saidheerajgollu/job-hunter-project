#!/usr/bin/env node
/** Apply ATS_OVERRIDES back into preset source files (one-time sync). */
import fs from 'fs';
import { BAY_AREA_COMPANIES } from '../src/presets/bayAreaCompanies.js';
import { NYC_COMPANIES } from '../src/presets/nycCompanies.js';
import { SEATTLE_COMPANIES } from '../src/presets/seattleCompanies.js';
import { applyAtsOverrides } from '../src/presets/atsOverrides.js';

const files = [
    { path: 'src/presets/bayAreaCompanies.js', arr: BAY_AREA_COMPANIES, exportName: 'BAY_AREA_COMPANIES' },
    { path: 'src/presets/nycCompanies.js', arr: NYC_COMPANIES, exportName: 'NYC_COMPANIES' },
    { path: 'src/presets/seattleCompanies.js', arr: SEATTLE_COMPANIES, exportName: 'SEATTLE_COMPANIES' },
];

function formatCompany(c) {
    const parts = [
        `name: '${c.name.replace(/'/g, "\\'")}'`,
        `domain: '${c.domain}'`,
        `career_url: '${c.career_url}'`,
        `ats_type: '${c.ats_type}'`,
    ];
    if (c.ats_slug) parts.push(`ats_slug: '${c.ats_slug}'`);
    else if (c.ats_type === 'custom') parts.push(`ats_slug: null`);
    parts.push(`category: '${c.category}'`);
    return `    { ${parts.join(', ')} }`;
}

for (const { path, arr, exportName } of files) {
    const fixed = applyAtsOverrides(arr);
    const content = fs.readFileSync(path, 'utf8');
    const start = content.indexOf(`export const ${exportName} = [`);
    const end = content.indexOf('];', start);
    if (start === -1 || end === -1) throw new Error(`Could not find array in ${path}`);

    const header = content.slice(0, start);
    const footer = content.slice(end + 2);
    const body = fixed.map(formatCompany).join(',\n');
    fs.writeFileSync(path, `${header}export const ${exportName} = [\n${body},\n];${footer}`);
    console.log(`Updated ${path}`);
}
