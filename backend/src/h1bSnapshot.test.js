import { describe, it, expect, vi, beforeEach } from 'vitest';
import zlib from 'zlib';
import fs from 'fs';
import os from 'os';
import path from 'path';

const db = vi.hoisted(() => ({
    getSetting: vi.fn(), upsertSetting: vi.fn(), countH1bEmployers: vi.fn(), replaceH1bEmployers: vi.fn(),
}));
vi.mock('./db.js', () => db);

const { writeH1bSnapshot, readH1bSnapshot, syncH1bSnapshot } = await import('./h1bSnapshot.js');

const rows = [
    { key: 'stripe', display_name: 'STRIPE INC', filings: 513, last_decision_date: '2026-06-30', fein_count: 1, min_fy: 2025, max_fy: 2026 },
    { key: 'figma', display_name: 'Figma, Inc.', filings: 108, last_decision_date: '2026-06-30', fein_count: 1, min_fy: 2025, max_fy: 2026 },
];

describe('h1b snapshot', () => {
    let file;
    beforeEach(() => {
        Object.values(db).forEach(f => f.mockReset());
        file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'snap-')), 'h1b.json.gz');
    });

    it('round-trips rows through a gzipped file with a content-based version', () => {
        const meta = writeH1bSnapshot(file, rows, ['LCA_Disclosure_Data_FY2026_Q3.xlsx']);
        const snap = readH1bSnapshot(file);
        expect(snap.rows).toEqual(rows);
        expect(snap.version).toBe(meta.version);
        expect(snap.sources).toEqual(['LCA_Disclosure_Data_FY2026_Q3.xlsx']);
        expect(JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).rows).toHaveLength(2);
    });

    it('loads the snapshot into the database when its version is new', async () => {
        const { version } = writeH1bSnapshot(file, rows, []);
        db.getSetting.mockResolvedValue(null);
        db.countH1bEmployers.mockResolvedValue(0);

        const result = await syncH1bSnapshot(file);

        expect(db.replaceH1bEmployers).toHaveBeenCalledWith(rows);
        expect(db.upsertSetting).toHaveBeenCalledWith('h1b_snapshot_version', version);
        expect(result).toEqual({ loaded: true, version, rows: 2 });
    });

    it('does nothing when that version is already loaded', async () => {
        const { version } = writeH1bSnapshot(file, rows, []);
        db.getSetting.mockResolvedValue(version);

        expect(await syncH1bSnapshot(file)).toEqual({ loaded: false, version, rows: 2 });
        expect(db.replaceH1bEmployers).not.toHaveBeenCalled();
    });

    it('refuses a snapshot far smaller than the current table and keeps the data', async () => {
        writeH1bSnapshot(file, rows, []);
        db.getSetting.mockResolvedValue('older');
        db.countH1bEmployers.mockResolvedValue(90000);

        await expect(syncH1bSnapshot(file)).rejects.toThrow(/under half/);
        expect(db.replaceH1bEmployers).not.toHaveBeenCalled();
    });

    it('is a no-op when no snapshot file exists', async () => {
        expect(await syncH1bSnapshot(path.join(path.dirname(file), 'missing.json.gz'))).toEqual({ loaded: false, version: null, rows: 0 });
    });
});
