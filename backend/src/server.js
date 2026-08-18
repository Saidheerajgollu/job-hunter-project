/**
 * Express REST API server
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { startScheduler, triggerScrape, triggerFastAtsPoll, triggerWatcher } from './scheduler.js';
import {
    initDb,
    getJobs, countJobs, updateJobStatus, updateJobNotes, markAllSeen,
    getStats, getAllSettings, upsertSetting, getLastScrapeRun,
    getAllJobsForReclassify, updateJobCategory,
    getWatchedCompanies, getWatchedCompany, insertWatchedCompany, deleteWatchedCompany,
    insertPushSubscription, deletePushSubscription, getRecentWatchNotifications,
} from './db.js';
import { classifyCategory, makeJobId } from './utils/helpers.js';
import { detectATS } from './utils/atsDetector.js';
import { DEFAULT_WATCH_ROLES_JSON } from './utils/roleFilters.js';
import { initPush, getVapidPublicKey, sendPushToAll } from './utils/pushNotifications.js';
import { SEATTLE_PRESET } from './presets/seattleCompanies.js';
import { NYC_PRESET } from './presets/nycCompanies.js';
import { BAY_AREA_PRESET } from './presets/bayAreaCompanies.js';

const ALL_PRESETS = [SEATTLE_PRESET, NYC_PRESET, BAY_AREA_PRESET];

const app = express();
const PORT = process.env.PORT || 4000;

// In production: set ALLOWED_ORIGIN env var to your Vercel URL (e.g. https://job-hunter-pro.vercel.app)
// Multiple origins can be comma-separated.
const allowedOrigins = [
    'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
];

app.use(cors({
    origin: (origin, cb) => {
        // allow non-browser requests (curl, health checks) and whitelisted origins
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
    },
}));
app.use(express.json());

// Wraps an async route handler so rejected promises become 500s instead of crashes.
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
    console.error(`API error [${req.method} ${req.path}]:`, err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

app.get('/api/jobs', wrap(async (req, res) => {
    const { status, category, role, source, search, page = 1, limit = 50, fresh_only, has_salary, max_age_days, experience, us_only } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const params = {
        status: status || null,
        role: role || category || null,
        source: source || null,
        search: search || null,
        fresh_only: fresh_only === '1',
        has_salary: has_salary === '1',
        max_age_days: max_age_days ? parseInt(max_age_days) : 0,
        experience: experience || null,
        us_only: us_only !== '0',
        limit: parseInt(limit),
        offset,
    };

    const [jobs, total] = await Promise.all([getJobs(params), countJobs(params)]);
    res.json({ jobs, total, page: parseInt(page), limit: parseInt(limit) });
}));

app.patch('/api/jobs/:id/status', wrap(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const valid = ['new', 'saved', 'applied', 'ignored'];
    if (!valid.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }

    await updateJobStatus(status, id);
    res.json({ ok: true });
}));

app.post('/api/jobs/mark-seen', wrap(async (_req, res) => {
    await markAllSeen();
    res.json({ ok: true });
}));

app.patch('/api/jobs/:id/notes', wrap(async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    await updateJobNotes(notes ?? null, id);
    res.json({ ok: true });
}));

// Re-classify all existing jobs using the latest classifyCategory logic
app.post('/api/jobs/reclassify', wrap(async (_req, res) => {
    const jobs = await getAllJobsForReclassify();
    let updated = 0;
    for (const job of jobs) {
        const newCategory = classifyCategory(job.title, job.description || '');
        if (!newCategory) continue;
        const changes = await updateJobCategory(newCategory, job.id);
        if (changes > 0) updated++;
    }
    res.json({ ok: true, total: jobs.length, updated });
}));

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get('/api/stats', wrap(async (_req, res) => {
    const [stats, lastRun] = await Promise.all([getStats(), getLastScrapeRun()]);
    res.json({ ...stats, last_run: lastRun });
}));

// ── Scraper Control ───────────────────────────────────────────────────────────

app.post('/api/scrape/run', (_req, res) => {
    res.json({ ok: true, message: 'Scrape started in background' });
    // Don't await — let it run in background
    triggerScrape().catch(console.error);
    triggerFastAtsPoll().catch(console.error);
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/settings', wrap(async (_req, res) => {
    res.json(await getAllSettings());
}));

app.post('/api/settings', wrap(async (req, res) => {
    const updates = req.body;
    // Never let API callers overwrite server-managed secrets.
    const PROTECTED = new Set(['vapid_public_key', 'vapid_private_key']);
    for (const [key, value] of Object.entries(updates)) {
        if (PROTECTED.has(key)) continue;
        await upsertSetting(key, String(value));
    }
    res.json({ ok: true, settings: await getAllSettings() });
}));

// ── Watched Companies ─────────────────────────────────────────────────────────

app.get('/api/companies', wrap(async (_req, res) => {
    res.json(await getWatchedCompanies());
}));

// Auto-detect ATS for a given name + domain before committing
app.post('/api/companies/detect', wrap(async (req, res) => {
    const { name, domain } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await detectATS(name, domain || null);
    res.json(result);
}));

app.post('/api/companies', wrap(async (req, res) => {
    const { name, domain, ats_type, ats_slug, career_url, watch_roles } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = makeJobId(`watch-${name}-${domain || ''}`);

    let detectedAts = { ats_type: ats_type || 'unknown', ats_slug: ats_slug || null, career_url: career_url || null };
    // Re-detect if caller didn't supply ATS info
    if (!ats_type || ats_type === 'unknown') {
        try { detectedAts = await detectATS(name, domain || null); } catch { /* keep defaults */ }
    }

    await insertWatchedCompany({
        id,
        name,
        domain: domain || null,
        career_url: detectedAts.career_url || career_url || null,
        ats_type: detectedAts.ats_type,
        ats_slug: detectedAts.ats_slug || ats_slug || null,
        watch_roles: watch_roles ? JSON.stringify(watch_roles) : DEFAULT_WATCH_ROLES_JSON,
    });

    res.json({ ok: true, company: await getWatchedCompany(id) });
}));

app.delete('/api/companies/:id', wrap(async (req, res) => {
    await deleteWatchedCompany(req.params.id);
    res.json({ ok: true });
}));

// Returns available company presets
app.get('/api/companies/presets', (_req, res) => {
    res.json(ALL_PRESETS.map(p => ({
        id: p.id,
        label: p.label,
        description: p.description,
        count: p.companies.length,
    })));
});

// Bulk-add companies from a preset
app.post('/api/companies/bulk', wrap(async (req, res) => {
    const { preset_id } = req.body;
    if (!preset_id) return res.status(400).json({ error: 'preset_id required' });

    const preset = ALL_PRESETS.find(p => p.id === preset_id);
    if (!preset) return res.status(404).json({ error: 'Preset not found' });

    let added = 0;
    let skipped = 0;

    for (const c of preset.companies) {
        const id = makeJobId(`watch-${c.name}-${c.domain || ''}`);
        const inserted = await insertWatchedCompany({
            id,
            name: c.name,
            domain: c.domain || null,
            career_url: c.career_url || null,
            ats_type: c.ats_type || 'custom',
            ats_slug: c.ats_slug || null,
            watch_roles: DEFAULT_WATCH_ROLES_JSON,
        });
        if (inserted) added++;
        else skipped++;
    }

    res.json({ ok: true, added, skipped, total: preset.companies.length });
}));

// Manually trigger watchlist check (runs in background)
app.post('/api/companies/watch/run', wrap(async (_req, res) => {
    triggerWatcher();
    res.json({ ok: true, message: 'Watchlist check started' });
}));

// ── Push Notifications ────────────────────────────────────────────────────────

app.get('/api/push/vapid-public-key', (_req, res) => {
    const key = getVapidPublicKey();
    if (!key) return res.status(503).json({ error: 'Push not initialized' });
    res.json({ key });
});

app.post('/api/push/subscribe', wrap(async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription object' });
    }
    await insertPushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
    res.json({ ok: true });
}));

app.delete('/api/push/unsubscribe', wrap(async (req, res) => {
    const { endpoint } = req.body;
    if (endpoint) await deletePushSubscription(endpoint);
    res.json({ ok: true });
}));

app.post('/api/push/test', wrap(async (_req, res) => {
    const sent = await sendPushToAll({
        title: '✅ Job Hunter Pro — Push Working!',
        body: 'You will now get notified the moment a new job is posted.',
        url: '/',
    });
    res.json({ ok: true, sent });
}));

app.get('/api/notifications', wrap(async (_req, res) => {
    res.json(await getRecentWatchNotifications());
}));

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
    await initDb();
    await initPush();
    app.listen(PORT, () => {
        console.log(`\n🎯 Job Hunter Pro API running at http://localhost:${PORT}`);
        startScheduler();
    });
}

main().catch((err) => {
    console.error('💥 Failed to start server:', err);
    process.exit(1);
});
