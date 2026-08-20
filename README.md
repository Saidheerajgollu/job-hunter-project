# Job Hunter Pro

A self-hosted job aggregator for tech roles. It collects listings from public APIs, ATS boards, and schema.org structured data on company career pages, tracks which ones are still open, and gives you one dashboard to search, filter, and track applications.

You apply on company sites yourself — this app finds the links, keeps them fresh, and keeps them organized.

## What it does

- **Aggregates jobs** from Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee, schema.org-embedded career pages, and other public feeds
- **Polls fast** — the direct-ATS sources are checked every 15 minutes for every company, not just ones you're watching
- **Detects closed listings** — a job that disappears from its source for two consecutive checks is marked closed and drops out of your feed, so you're not wasting time on dead links (jobs you've already saved or applied to stay visible with a "listing closed" badge instead of vanishing)
- **Filters by role** — Software Eng, Frontend, Backend, Full Stack, AI, ML, Data Science, Data Engineer, Data Analyst, DevOps
- **US-focused filtering** — prioritizes US-located roles; excludes citizenship-only postings
- **Experience filters** — Any, 1yr, 2yr, 3yr, 4yr, 5+ yr (matched from job titles)
- **Tracks applications** — save, apply, hide; notes per job
- **Detects reposts** — flags jobs that reappear on a board with a new date
- **Company watchlist** — monitor specific employers; get browser push alerts when new matching roles appear
- **Regional presets** — bulk-import watchlists for Seattle, NYC/NJ, Bay Area companies, and companies discovered from Web Data Commons' schema.org job-posting dataset

## How it works

1. **Backend scrapers** fetch jobs from public JSON APIs, ATS endpoints, and schema.org structured data (no browser automation).
2. The **7 direct-ATS sources** (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee) are polled every 15 minutes across every known company. A job missing from two consecutive polls is marked closed.
3. **Free job boards and optional paid feeds** (JSearch, Fantastic.jobs, Adzuna) run on their own hourly/12-hour schedule — they're excluded from closed-job detection since their listings are sampled, not complete.
4. Jobs are **deduplicated by URL**, classified by title keywords, and stored in **Postgres**.
5. The **company watchlist** checks every 30 minutes and pushes a browser notification the moment a watched company posts something new — including companies whose only structured data is schema.org markup, not a named ATS.
6. The **Next.js frontend** reads from the Express API — it never talks to the database or holds API keys.

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express |
| Database | Supabase Postgres (`pg`) |
| Scheduler | node-cron |
| Testing | Vitest |
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

Open **http://localhost:3000**. Use **Sync Now** to trigger a scrape, or wait for the scheduler.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres connection URI |
| `ALLOWED_ORIGIN` | Production | Vercel frontend URL for CORS |
| `PUSH_CONTACT_EMAIL` | For push | Email used in Web Push VAPID headers |
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
    server.js     Express REST API
    db.js         Postgres data layer
    scraper.js    Hourly scraper orchestrator (free boards, optional feeds)
    fastPoll.js   15-minute poller for the 7 direct-ATS sources, with closed-listing detection
    scheduler.js  Cron jobs
    scrapers/     One module per job source
    watchers/     Company watchlist monitor
    utils/        Filters, ATS detection, schema.org parsing, staleness detection, WDC discovery, push
    presets/      Regional and discovered company presets
  scripts/        One-off maintenance scripts (watchlist repair, company discovery)
frontend/
  src/
    app/          Dashboard and settings pages
    components/   Watchlist, notification bell
    lib/api.ts    API client
```

## Scripts

```bash
# Backend — dev with auto-reload
cd backend && npm run dev

# Backend — one-off scrape
cd backend && npm run scrape

# Backend — run the test suite
cd backend && npm test

# Backend — discover new watchlist companies from Web Data Commons
cd backend && node scripts/discover-companies-from-wdc.js

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
