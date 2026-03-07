/**
 * Migration: re-categorize all existing jobs using the improved classifyCategory
 * Run once: node src/migrate-categories.js
 */
import Database from 'better-sqlite3';
import { classifyCategory } from './utils/helpers.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '../../data/jobs.db'));

const jobs = db.prepare('SELECT id, title, source FROM jobs').all();
const update = db.prepare('UPDATE jobs SET category = ? WHERE id = ?');

const updateAll = db.transaction(() => {
    const counts = {};
    for (const job of jobs) {
        const cat = classifyCategory(job.title, '');
        update.run(cat, job.id);
        counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
});

const counts = updateAll();
console.log(`✅ Re-categorized ${jobs.length} jobs:`);
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => console.log(`   ${cat.padEnd(15)} ${n}`));

db.close();
