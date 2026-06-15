# Job Hunter Pro

A self-hosted job aggregator for tech roles. It collects listings from public APIs and ATS boards, stores them in Postgres, and gives you one dashboard to search, filter, and track applications.

You apply on company sites yourself — this app finds the links and keeps them organized.

## What it does

- **Aggregates jobs** from Greenhouse, Lever, Ashby, Workday, and other public feeds
- **Filters by role** — Software Eng, Frontend, Backend, Full Stack, AI, ML, Data Science, Data Engineer, Data Analyst, DevOps
- **US-focused filtering** — prioritizes US-located roles; excludes citizenship-only postings
- **Experience filters** — Any, 1yr, 2yr, 3yr, 4yr, 5+ yr (matched from job titles)
- **Tracks applications** — save, apply, hide; notes per job
- **Detects reposts** — flags jobs that reappear on a board with a new date
- **Company watchlist** — monitor specific employers; get browser push alerts when new matching roles appear
- **Regional presets** — bulk-import watchlists for Seattle, NYC/NJ, and Bay Area companies

## How it works

```
Job sources (APIs)  →  Node.js scrapers  →  Supabase Postgres  →  Next.js dashboard
                              ↑
                    Company watchlist (ATS polling + optional context.dev)
```

1. **Backend scrapers** fetch jobs from public JSON APIs and ATS endpoints (no browser automation).
2. Jobs are **deduplicated by URL**, classified by title keywords, and stored in **Postgres**.
3. A **cron scheduler** runs the main scrape hourly and the watchlist checker every 30 minutes.
4. The **Next.js frontend** reads from the Express API — it never talks to the database or holds API keys.

Optional scrapers (JSearch, Fantastic.jobs, Adzuna, context.dev) run only when their env vars are set.

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express |
| Database | Supabase Postgres (`pg`) |
| Scheduler | node-cron |
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Notifications | Web Push (VAPID) |
| Deploy | Vercel (frontend) · Railway (backend) · Supabase (database) |

## Quick start

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Database

In Supabase: **Project Settings → Database → Connection string → URI**. Copy the connection string.

### 2. Backend

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL in .env
npm install
npm run dev
```

The API runs at `http://localhost:4000`. Tables are created on first boot.

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open **http://localhost:3000**. Use **Sync Now** to trigger a scrape, or wait for the hourly scheduler.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres connection URI |
| `ALLOWED_ORIGIN` | Production | Vercel frontend URL for CORS |
| `PUSH_CONTACT_EMAIL` | For push | Email used in Web Push VAPID headers |
| `CONTEXT_DEV_API_KEY` | No | [context.dev](https://context.dev) — BigTech search, platform discovery, custom career pages |
| `RAPIDAPI_KEY` | No | JSearch (LinkedIn/Indeed/Glassdoor), every 12h |
| `FANTASTIC_API_KEY` | No | Fantastic.jobs Active Jobs DB, every 12h |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | No | Adzuna job search |
| `MUSE_API_KEY` | No | The Muse — higher rate limits |

Keep all secrets in `backend/.env` only. Do not commit this file.

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | Backend API URL (default: `http://localhost:4000/api`) |

The frontend only needs the public backend URL — no database or scraper keys.

## Deploy

**Supabase** — use the same project from local setup.

**Railway (backend)**

1. Connect the GitHub repo, set root directory to `backend`
2. Set `DATABASE_URL`, `ALLOWED_ORIGIN`, and `PUSH_CONTACT_EMAIL`
3. Add optional API keys as needed

**Vercel (frontend)**

1. Connect the repo, set root directory to `frontend`
2. Set `NEXT_PUBLIC_API_URL` to your Railway URL with `/api` suffix

## Project structure

```
backend/
  src/
    server.js           Express REST API
    db.js               Postgres data layer
    scraper.js          Scraper orchestrator
    scheduler.js        Cron jobs
    scrapers/           One module per job source
    watchers/           Company watchlist monitor
    utils/              Filters, ATS detection, context.dev client, push
    presets/            Regional company presets (Seattle, NYC, Bay Area)
frontend/
  src/
    app/                Dashboard and settings pages
    components/         Watchlist, notification bell
    lib/api.ts          API client
```

## Scripts

```bash
# Backend — dev with auto-reload
cd backend && npm run dev

# Backend — one-off scrape
cd backend && npm run scrape

# Frontend
cd frontend && npm run dev
```

## License

MIT — personal use. Job data belongs to the original sources; this project aggregates publicly available APIs and feeds.

## Reach out

<p align="center">
  <a href="https://github.com/Saidheerajgollu" title="GitHub">
    <img alt="GitHub" src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" height="32">
  </a>
  &nbsp;
  <a href="https://linkedin.com/in/sai-dheeraj-gollu" title="LinkedIn">
    <img alt="LinkedIn" src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" height="32">
  </a>
  &nbsp;
  <a href="https://saidheerajgollu.com" title="Website">
    <img alt="Website" src="https://img.shields.io/badge/saidheerajgollu.com-C41E3A?style=for-the-badge&logo=googlechrome&logoColor=white" height="32">
  </a>
</p>
