import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readLcaRows, REQUIRED_COLUMNS } from './lcaReader.js';
import { createAggregator } from './h1bAggregate.js';

let dir;
const header = ['CASE_NUMBER', 'CASE_STATUS', 'DECISION_DATE', 'VISA_CLASS', 'JOB_TITLE', 'EMPLOYER_NAME', 'TRADE_NAME_DBA', 'EMPLOYER_FEIN', 'EMPLOYER_POC_EMAIL', 'AGENT_ATTORNEY_LAST_NAME'];

async function writeXlsx(file, rows, cols = header) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(cols);
    rows.forEach(r => ws.addRow(r));
    await wb.xlsx.writeFile(file);
}

beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lca-'));
    await writeXlsx(path.join(dir, 'sample.xlsx'), [
        ['I-1', 'Certified', new Date(Date.UTC(2026, 2, 15)), 'H-1B', 'Software Engineer', 'STRIPE INC', '', '11', 'poc@stripe.com', 'Doe'],
        ['I-2', 'Certified - Withdrawn', 46203, 'H-1B', 'Data Engineer', 'STRIPE INC', '', '11', 'poc@stripe.com', 'Doe'],
        ['I-3', 'Denied', new Date(Date.UTC(2026, 1, 1)), 'H-1B', 'SWE', 'STRIPE INC', '', '11', '', ''],
        ['I-4', 'Certified', new Date(Date.UTC(2026, 1, 1)), 'E-3 Australian', 'SWE', 'STRIPE INC', '', '11', '', ''],
        ['I-1', 'Certified', new Date(Date.UTC(2026, 2, 15)), 'H-1B', 'Software Engineer', 'STRIPE INC', '', '11', '', ''],
        ['I-5', 'Certified', new Date(Date.UTC(2024, 5, 1)), 'H-1B', 'SWE', 'OLDCO INC', '', '22', '', ''],
    ]);
    await writeXlsx(path.join(dir, 'bad.xlsx'), [['x', 'y']], ['FOO', 'BAR']);
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('readLcaRows', () => {
    it('streams rows as objects with only the fields the aggregator needs', async () => {
        const rows = [];
        for await (const row of readLcaRows(path.join(dir, 'sample.xlsx'))) rows.push(row);

        expect(rows).toHaveLength(6);
        expect(Object.keys(rows[0]).sort()).toEqual(['CASE_NUMBER', 'CASE_STATUS', 'DECISION_DATE', 'EMPLOYER_FEIN', 'EMPLOYER_NAME', 'TRADE_NAME_DBA', 'VISA_CLASS']);
        expect(JSON.stringify(rows)).not.toContain('poc@stripe.com');
    });

    it('feeds the aggregator end to end: 2 Stripe filings, old and invalid rows dropped', async () => {
        const agg = createAggregator();
        for await (const row of readLcaRows(path.join(dir, 'sample.xlsx'))) agg.add(row);
        const result = agg.result();

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ key: 'stripe', filings: 2, last_decision_date: '2026-06-30', fein_count: 1 });
    });

    it('gives identical results on every read (no ordering race inside the zip)', async () => {
        const runs = [];
        for (let i = 0; i < 10; i++) {
            const rows = [];
            for await (const row of readLcaRows(path.join(dir, 'sample.xlsx'))) rows.push(row);
            runs.push(JSON.stringify(rows));
        }
        expect(new Set(runs).size).toBe(1);
        expect(runs[0]).toContain('STRIPE INC');
    });

    it('fails with a clear message when a required column is missing', async () => {
        const read = async () => { for await (const _ of readLcaRows(path.join(dir, 'bad.xlsx'))) { /* drain */ } };
        await expect(read()).rejects.toThrow(/missing required column/i);
        expect(REQUIRED_COLUMNS).toEqual(['CASE_NUMBER', 'CASE_STATUS', 'VISA_CLASS', 'DECISION_DATE', 'EMPLOYER_NAME']);
    });
});
