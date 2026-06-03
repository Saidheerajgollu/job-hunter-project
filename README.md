# Job Hunter Pro

Personal job-link aggregator for **2026 new grads** — AI, SWE, and Data roles from across the web, synced automatically. You apply yourself; this app finds and tracks the links.

Inspired by tools like [Simplify](https://simplify.jobs) and [Tsenta](https://tsenta.com), but self-hosted and tuned for new-grad filtering.

## Features

- **API-based sources** — Greenhouse, Lever, Ashby, Workday, SimplifyJobs, RemoteOK, Remotive, Himalayas, WeWorkRemotely, Adzuna, plus optional JSearch and Fantastic.jobs (Active Jobs DB) via RapidAPI keys
- **Hourly auto-sync** — cron scheduler runs on boot and every hour
- **Company watchlist** — track specific companies; their ATS is polled every 10 min and you get a push the moment a matching role is published (usually before it hits LinkedIn/Indeed/Simplify)
- **250+ company presets** — Seattle, NYC/NJ, Bay Area OPT-friendly lists
- **ATS auto-detection + monitoring** — Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee; custom pages are inspected for an embedded ATS and fall back to change-detection
- **10 role categories** — SWE, Frontend, Backend, Full Stack, AI, ML, Data Science, Data Engineer, Data Analyst, DevOps
- **Application tracking** — Save, Apply, Hide; auto-mark applied when you click Apply →
- **Senior filtering** — auto-excludes Senior/Staff/Principal/Lead roles
- **Persistent storage** — Supabase Postgres (survives Railway redeploys)

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20 + Express |
| Database | Supabase Postgres (`pg`) |
| Scraping | Native fetch (no browser) |
| Frontend | Next.js 15 + React 19 |
| Scheduler | node-cron (hourly) |
| Deploy | Vercel (frontend) + Railway (backend) + Supabase (DB) |

## Quick Start (local)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → Database → Connection string → URI**
3. Copy the URI (use the **Session pooler** connection string)

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL to your Supabase URI
npm install
npm run dev
```

Tables are created automatically on first boot.

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Default points to http://localhost:4000/api — no change needed for local dev
npm install
npm run dev
```

Open **http://localhost:3000** → click **Sync Now** to fetch jobs.

## Deploy to production

### Supabase (database)

Already set up from Quick Start. No extra config — tables auto-create on backend boot.

### Railway (backend)

1. Push this repo to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub → select repo
3. Set **Root Directory** to `backend`
4. Railway detects the Dockerfile automatically
5. Add environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Supabase connection URI |
| `ALLOWED_ORIGIN` | Your Vercel URL (e.g. `https://job-hunter.vercel.app`) |
| `PUSH_CONTACT_EMAIL` | Your email (for Web Push VAPID) |
| `RAPIDAPI_KEY` | *(optional)* JSearch API key |
| `ADZUNA_APP_ID` | *(optional)* Adzuna app ID |
| `ADZUNA_APP_KEY` | *(optional)* Adzuna app key |

6. Deploy → copy the public URL (e.g. `https://job-hunter-backend.up.railway.app`)

### Vercel (frontend)

1. [vercel.com](https://vercel.com) → Import GitHub repo
2. Set **Root Directory** to `frontend`
3. Add environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-railway-url.up.railway.app/api` |

4. Deploy

## Optional API keys

| Key | Source | What it adds |
|---|---|---|
| `RAPIDAPI_KEY` | [JSearch on RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) | LinkedIn/Indeed/Glassdoor aggregation (every 12h, ~240 calls/mo free) |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | [Adzuna Developer](https://developer.adzuna.com) | Extra job board coverage |

Both are optional — the app works without them using the 9 free API sources.

## Project structure

```
backend/
  src/
    server.js          # Express API
    db.js              # Postgres data layer (Supabase)
    scraper.js         # Scraper orchestrator
    scheduler.js       # Cron jobs
    scrapers/          # One file per source
    watchers/          # Company watchlist monitor
    utils/             # Helpers, ATS detector, push notifications
    data/              # Company presets (Seattle, NYC, Bay Area)
frontend/
  src/
    app/page.tsx       # Main dashboard
    app/settings/      # Settings page
    components/        # WatchlistPanel, NotificationBell
    lib/api.ts         # API client
```

## License

MIT — personal use. Job data belongs to respective sources; this tool aggregates public APIs only.
