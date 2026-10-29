/**
 * Read/write the gzipped H-1B snapshot (per-company counts only). No database
 * access here, so the snapshot can be built on a laptop without DATABASE_URL.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

export const DEFAULT_SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'h1b-employers.json.gz');

/** Write rows to a gzipped snapshot. The version is a hash of the rows, so identical data keeps its version. */
export function writeH1bSnapshot(file, rows, sources) {
    const version = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
    const body = { version, generated_at: new Date().toISOString(), sources, rows };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(body), { level: 9 }));
    return { version, rows: rows.length };
}

export function readH1bSnapshot(file) {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
}

