import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    url TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    salary TEXT,
    description TEXT,
    posted_at TEXT,
    scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'new',
    is_new INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS scrape_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    jobs_found INTEGER DEFAULT 0,
    jobs_new INTEGER DEFAULT 0,
    errors TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
  CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
  CREATE INDEX IF NOT EXISTS idx_jobs_scraped_at ON jobs(scraped_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_is_new ON jobs(is_new);
`);

// Seed default settings
const defaultSettings = {
  keywords_ai: 'new grad AI engineer,new grad machine learning engineer,entry level AI engineer,2026 new grad AI',
  keywords_swe: 'new grad software engineer,entry level software engineer,2026 new grad SWE,new grad full stack',
  keywords_data: 'new grad data scientist,new grad data engineer,entry level data scientist,new grad analytics engineer',
  scrape_interval_hours: '4',
  filter_exclude_senior: 'true',
  notification_enabled: 'true',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

// ── Prepared Statements ──────────────────────────────────────────────────────

export const insertJob = db.prepare(`
  INSERT OR IGNORE INTO jobs (id, title, company, location, url, source, category, salary, description, posted_at, status, is_new)
  VALUES (@id, @title, @company, @location, @url, @source, @category, @salary, @description, @posted_at, 'new', 1)
`);

export const getJobs = db.prepare(`
  SELECT * FROM jobs
  WHERE
    (:status IS NULL OR status = :status) AND
    (:category IS NULL OR category = :category) AND
    (:source IS NULL OR source = :source) AND
    (:search IS NULL OR title LIKE :search OR company LIKE :search)
  ORDER BY posted_at DESC, scraped_at DESC
  LIMIT :limit OFFSET :offset
`);

export const countJobs = db.prepare(`
  SELECT COUNT(*) as total FROM jobs
  WHERE
    (:status IS NULL OR status = :status) AND
    (:category IS NULL OR category = :category) AND
    (:source IS NULL OR source = :source) AND
    (:search IS NULL OR title LIKE :search OR company LIKE :search)
`);

export const updateJobStatus = db.prepare(`
  UPDATE jobs SET status = ?, is_new = 0 WHERE id = ?
`);

export const markAllSeen = db.prepare(`
  UPDATE jobs SET is_new = 0 WHERE is_new = 1
`);

export const getStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_count,
    SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied,
    SUM(CASE WHEN status = 'saved' THEN 1 ELSE 0 END) as saved,
    SUM(CASE WHEN scraped_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) as last_24h
  FROM jobs
`);

export const getSettings = db.prepare('SELECT key, value FROM settings');

export const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

export const startScrapeRun = db.prepare(`
  INSERT INTO scrape_runs (started_at) VALUES (datetime('now'))
`);

export const finishScrapeRun = db.prepare(`
  UPDATE scrape_runs
  SET finished_at = datetime('now'), jobs_found = ?, jobs_new = ?, errors = ?
  WHERE id = ?
`);

export const getLastScrapeRun = db.prepare(`
  SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT 1
`);

export function getAllSettings() {
  const rows = getSettings.all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export default db;
