/**
 * End-to-end check against a local Postgres: run migrations, one fast ATS poll,
 * one main scrape (and the wide sweep with --wide), then report per-source counts and what the feed API returns.
 *
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres PGSSL=false node scripts/e2e-local.js
 */
import 'dotenv/config';
import { initDb, query, getJobs, countJobs } from '../src/db.js';
import { runFastAtsPoll } from '../src/fastPoll.js';
import { runScraper } from '../src/scraper.js';
import { runWideSweep } from '../src/wideSweep.js';

await initDb();
const t0 = Date.now();
await runFastAtsPoll();
const t1 = Date.now();
await runScraper();
const t2 = Date.now();
if (process.argv.includes('--wide')) await runWideSweep();
const t3 = Date.now();

const bySource = await query(`
  SELECT source, COUNT(*)::int AS jobs,
         MIN(posted_at)::date AS oldest, MAX(posted_at)::date AS newest,
         SUM(CASE WHEN closed_at IS NOT NULL THEN 1 ELSE 0 END)::int AS closed
  FROM jobs GROUP BY source ORDER BY jobs DESC`);
console.log(`\nFast poll ${((t1 - t0) / 1000).toFixed(0)}s, main scrape ${((t2 - t1) / 1000).toFixed(0)}s, wide sweep ${((t3 - t2) / 1000).toFixed(0)}s`);
console.table(bySource.rows);
const feed = { us_only: true, limit: 5, offset: 0 };
console.log('Feed total (default filters):', await countJobs(feed));
console.log('Feed total, posted in last 7 days:', await countJobs({ ...feed, max_age_days: 7 }));
for (const j of await getJobs(feed)) console.log(`  ${j.title} @ ${j.company} | ${j.location} | ${j.source} | ${j.posted_at?.toISOString?.()}`);
process.exit(0);
