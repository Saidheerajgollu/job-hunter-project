/**
 * Streams rows out of a DOL LCA disclosure .xlsx (hundreds of MB) without
 * loading the sheet into memory. Yields plain objects holding only the fields
 * the H-1B aggregator uses — contact, attorney and preparer columns are skipped.
 *
 * An .xlsx is a zip. Opening it by its central directory lets us read
 * xl/sharedStrings.xml first and then stream the sheet, whatever order the
 * parts are stored in (exceljs's streaming reader races on that order).
 */

import unzipper from 'unzipper';
import { SaxesParser } from 'saxes';

export const REQUIRED_COLUMNS = ['CASE_NUMBER', 'CASE_STATUS', 'VISA_CLASS', 'DECISION_DATE', 'EMPLOYER_NAME'];
const OPTIONAL_COLUMNS = ['TRADE_NAME_DBA', 'EMPLOYER_FEIN'];
const WANTED = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

/** "AB12" → 27 (0-based column index). */
function columnIndex(ref) {
    let n = 0;
    for (const ch of ref) {
        const code = ch.charCodeAt(0);
        if (code < 65 || code > 90) break;
        n = n * 26 + (code - 64);
    }
    return n - 1;
}

/** Feed an entry's bytes through a SAX parser; `onChunkDone` runs after each chunk. */
async function* parseEntry(entry, setup) {
    const parser = new SaxesParser();
    const ready = [];
    setup(parser, item => ready.push(item));
    for await (const chunk of entry.stream()) {
        parser.write(chunk.toString('utf8'));
        while (ready.length) yield ready.shift();
    }
    parser.close();
    while (ready.length) yield ready.shift();
}

async function readSharedStrings(entry) {
    const strings = [];
    if (!entry) return strings;
    let inText = false, current = null;
    const items = parseEntry(entry, (p, emit) => {
        p.on('opentag', t => { if (t.name === 'si') current = ''; else if (t.name === 't') inText = true; });
        p.on('text', txt => { if (inText && current !== null) current += txt; });
        p.on('closetag', t => {
            if (t.name === 't') inText = false;
            else if (t.name === 'si') { emit(current); current = null; }
        });
    });
    for await (const s of items) strings.push(s);
    return strings;
}

/** Cell value as read from the sheet: shared/inline strings as text, others as numbers when numeric. */
function cellValue(cell, strings) {
    if (cell.type === 's') return strings[Number(cell.v)] ?? null;
    if (cell.type === 'inlineStr' || cell.type === 'str') return cell.v;
    if (cell.v === '' || cell.v === null) return null;
    const n = Number(cell.v);
    return Number.isFinite(n) ? n : cell.v;
}

export async function* readLcaRows(file) {
    const zip = await unzipper.Open.file(file);
    const byPath = new Map(zip.files.map(f => [f.path, f]));
    const sheet = zip.files
        .filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f.path))
        .sort((a, b) => Number(a.path.match(/(\d+)\.xml$/)[1]) - Number(b.path.match(/(\d+)\.xml$/)[1]))[0];
    if (!sheet) throw new Error(`${file}: no worksheet found`);
    const strings = await readSharedStrings(byPath.get('xl/sharedStrings.xml'));

    let columns = null; // [field name, 0-based column index]
    const rows = parseEntry(sheet, (p, emit) => {
        let row = null, cell = null, inValue = false;
        p.on('opentag', t => {
            if (t.name === 'row') row = new Map();
            else if (t.name === 'c' && row) cell = { col: columnIndex(t.attributes.r || ''), type: t.attributes.t || 'n', v: '' };
            else if ((t.name === 'v' || t.name === 't') && cell) inValue = true;
        });
        p.on('text', txt => { if (inValue && cell) cell.v += txt; });
        p.on('closetag', t => {
            if (t.name === 'v' || t.name === 't') inValue = false;
            else if (t.name === 'c' && cell) { row.set(cell.col, cellValue(cell, strings)); cell = null; }
            else if (t.name === 'row' && row) { emit(row); row = null; }
        });
    });

    for await (const row of rows) {
        if (!columns) {
            const headers = new Map();
            for (const [col, v] of row) { const name = String(v ?? '').trim().toUpperCase(); if (name) headers.set(name, col); }
            const missing = REQUIRED_COLUMNS.filter(c => !headers.has(c));
            if (missing.length) throw new Error(`${file}: missing required column(s): ${missing.join(', ')}`);
            columns = WANTED.filter(c => headers.has(c)).map(c => [c, headers.get(c)]);
            continue;
        }
        const out = {};
        for (const [name, col] of columns) out[name] = row.get(col) ?? null;
        yield out;
    }
}
