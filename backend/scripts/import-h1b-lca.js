#!/usr/bin/env node
/**
 * Load US Dept. of Labor LCA disclosure files into h1b_employers.
 *
 * Download the files in a browser (dol.gov blocks automated downloads) from
 * https://www.dol.gov/agencies/eta/foreign-labor/performance — the latest
 * FY2026 file and the FY2025 Q4 file — then run:
 *
 *   DATABASE_URL=... node scripts/import-h1b-lca.js LCA_Disclosure_Data_FY2025_Q4.xlsx LCA_Disclosure_Data_FY2026_Q3.xlsx
 *
 * Only per-employer counts are stored; the table is replaced in one transaction.
 */
import 'dotenv/config';
import { initDb, replaceH1bEmployers, countH1bEmployers } from '../src/db.js';
import { readLcaRows } from '../src/utils/lcaReader.js';
import { createAggregator, isCountedFiling, checkImportSize } from '../src/utils/h1bAggregate.js';

const force = process.argv.includes('--force');
const files = process.argv.slice(2).filter(a => a !== '--force');
if (!files.length) {
    console.error('Usage: node scripts/import-h1b-lca.js <LCA_Disclosure_Data_FY20XX_QX.xlsx> [more.xlsx] [--force]');
    process.exit(1);
}

try {
    await initDb();
    const agg = createAggregator();
    for (const file of files) {
        let read = 0, counted = 0;
        const t0 = Date.now();
        for await (const row of readLcaRows(file)) {
            read++;
            if (isCountedFiling(row)) counted++;
            agg.add(row);
            if (read % 100000 === 0) console.log(`  ${file}: ${read.toLocaleString()} rows…`);
        }
        console.log(`📄 ${file}: ${read.toLocaleString()} rows, ${counted.toLocaleString()} certified H-1B (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    const employers = agg.result();
    checkImportSize(employers.length, await countH1bEmployers(), { force });
    const written = await replaceH1bEmployers(employers);
    const filings = employers.reduce((n, e) => n + e.filings, 0);
    console.log(`✅ Stored ${written.toLocaleString()} employer keys (${filings.toLocaleString()} filings counted, FY2025+ only)`);
    process.exit(0);
} catch (err) {
    console.error(`❌ Import failed, previous H-1B data kept: ${err.message}`);
    process.exit(1);
}
