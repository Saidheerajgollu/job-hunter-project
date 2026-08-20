#!/usr/bin/env node
/** Run watchlist ATS repair against DATABASE_URL. Usage: node scripts/repair-watchlist.js [--errors-only] */
import 'dotenv/config';
import { initDb } from '../src/db.js';
import { repairWatchlist } from '../src/watchers/repairWatchlist.js';

const onlyErrors = process.argv.includes('--errors-only');

await initDb();
console.log(`\nRepairing watchlist${onlyErrors ? ' (errors only)' : ''}...\n`);
const result = await repairWatchlist({ onlyErrors });
console.log(`\nDone: ${result.repaired} repaired, ${result.skipped} skipped, ${result.total} checked`);
process.exit(0);
