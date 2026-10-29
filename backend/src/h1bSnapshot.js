/**
 * H-1B data travels with the code as a small gzipped snapshot of per-company
 * counts (built locally by scripts/import-h1b-lca.js --snapshot). On startup
 * the backend loads it into h1b_employers when its version is new, so the
 * production import needs no database credentials on anyone's laptop.
 */

import fs from 'fs';
import { getSetting, upsertSetting, countH1bEmployers, replaceH1bEmployers } from './db.js';
import { checkImportSize } from './utils/h1bAggregate.js';
import { DEFAULT_SNAPSHOT, readH1bSnapshot } from './utils/h1bSnapshotFile.js';

export { DEFAULT_SNAPSHOT, writeH1bSnapshot, readH1bSnapshot } from './utils/h1bSnapshotFile.js';

/** Load the snapshot into the database if it is newer than what was last loaded. */
export async function syncH1bSnapshot(file = DEFAULT_SNAPSHOT) {
    if (!fs.existsSync(file)) return { loaded: false, version: null, rows: 0 };
    const snap = readH1bSnapshot(file);
    if ((await getSetting('h1b_snapshot_version')) === snap.version) {
        return { loaded: false, version: snap.version, rows: snap.rows.length };
    }
    checkImportSize(snap.rows.length, await countH1bEmployers());
    await replaceH1bEmployers(snap.rows);
    await upsertSetting('h1b_snapshot_version', snap.version);
    return { loaded: true, version: snap.version, rows: snap.rows.length };
}
