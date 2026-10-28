# Job Hunter Pro

A self-hosted job aggregator for US tech roles. The backend collects postings from company job boards, big-company career sites, and public job sites, and stores them in Postgres. The frontend is a dashboard to filter jobs, track applications, and watch specific companies. You still apply on the company's own site.

## Where jobs come from

| What | How often | Notes |
|---|---|---|
| Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee | every 15 min | Seed company lists plus companies found in SimplifyJobs links |
| Wide ATS sweep | every 6 h | ~28k more Greenhouse / Lever / Ashby / Workday boards from the public [job-board-aggregator](https://github.com/Feashliaa/job-board-aggregator) list. Keeps jobs posted in the last 30 days |
| Amazon, Apple, Google, TikTok, ByteDance | hourly | Each company's own careers site |
| Eightfold sites (Netflix, Microsoft, Qualcomm, more) | hourly | Extra tenants found in SimplifyJobs links |
| Oracle Cloud sites (JPMorgan, Honeywell, more) | hourly | Extra tenants found in SimplifyJobs links |
| SimplifyJobs, Hacker News "Who is hiring?", Himalayas, RemoteOK, Remotive, We Work Remotely, The Muse, Jobicy | hourly | |
| JSearch, Fantastic.jobs, Adzuna | every 12 h | Optional, only run if you set their API keys |

All sources are public endpoints. There are no logins, no browser automation, and no AI/LLM calls. Scrapers follow each site's robots.txt (for example, only the first page of Google results is read).

Not covered: Meta (its careers site has no public endpoint, so Meta jobs only arrive through SimplifyJobs), and sites like LinkedIn or Jobright that need an account.

## What happens to a job

1. Each title is classified into a role (SWE, frontend, backend, full stack, AI, ML, data science, data engineer, data analyst, DevOps). Non-tech titles are dropped.
2. Non-US locations and postings that require US citizenship or a security clearance are dropped.
3. Jobs are deduplicated by URL. If a known job comes back with a newer posting date, it is flagged as reposted.
4. For ATS boards that return their full listing, a job missing from two checks in a row is marked closed and leaves the feed. Saved and applied jobs stay visible with a "listing closed" badge.

## Dashboard features

- Filter by role, source, experience level (from the title), posting age (24h / 7 days / 30 days), salary listed, and text search
- Mark jobs as saved, applied, or hidden, and keep notes per job
- Company watchlist: add a company (its ATS is detected automatically) and get browser push alerts when it posts a matching role
- Watchlist presets for Bay Area, Seattle, and NYC/NJ companies, plus companies found in Web Data Commons' schema.org job data
- Settings page: hide senior roles (off by default) and set the navbar label

## Stack

- Backend: Node.js 20, Express, Postgres (`pg`), node-cron, Web Push, Vitest
- Frontend: Next.js 15, React 19, Tailwind CSS 4, TypeScript
- Hosting used: Railway (backend), Vercel (frontend), Supabase (Postgres)

## Setup

You need Node.js 20+ and a Postgres database (a free Supabase project works).

```bash
cd backend
cp .env.example .env    # set DATABASE_URL
npm install
npm run dev             # API on http://localhost:4000, tables created on first start
```

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev             # dashboard on http://localhost:3000
```

Press **Sync Now** in the dashboard to start a scrape right away, or wait for the scheduler (first runs start 1 to 3 minutes after the backend boots; the wide sweep starts after 20 minutes).

## Environment variables

Backend (`backend/.env`):

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `PGSSL` | No | `false` for a local Postgres without SSL |
| `ALLOWED_ORIGIN` | In production | Frontend URL(s) for CORS, comma-separated |
| `PORT` | No | API port, default 4000 |
| `PUSH_CONTACT_EMAIL` | For push alerts | Contact email for Web Push |
| `WIDE_SWEEP` | No | `false` turns off the 6-hour wide sweep (useful on a small database) |
| `WIDE_SWEEP_MAX_AGE_DAYS` | No | Age limit for wide-sweep jobs, default 30 |
| `RAPIDAPI_KEY` | No | JSearch |
| `FANTASTIC_API_KEY` | No | Fantastic.jobs |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | No | Adzuna |
| `MUSE_API_KEY` | No | Higher rate limit for The Muse |

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_API_URL`, default `http://localhost:4000/api`. The frontend never needs database or scraper keys.

## API

The backend serves JSON under `/api`:

| Endpoint | Purpose |
|---|---|
| `GET /jobs` | Job feed. Query: `role`, `source`, `status`, `search`, `experience`, `max_age_days`, `fresh_only`, `has_salary`, `us_only`, `page`, `limit` |
| `PATCH /jobs/:id/status`, `PATCH /jobs/:id/notes` | Set status (`new`, `saved`, `applied`, `ignored`) or notes |
| `POST /jobs/mark-seen`, `POST /jobs/reclassify` | Clear "new" flags; re-run role classification |
| `GET /stats` | Counts and last scrape run |
| `POST /scrape/run` | Start a scrape and an ATS poll now |
| `GET`/`POST /settings` | Read or update settings |
| `/companies`, `/companies/presets`, `/companies/bulk`, `/companies/detect`, `/companies/watch/run`, `/companies/repair` | Watchlist |
| `/push/*`, `GET /notifications` | Push subscriptions and alert history |
| `GET /health` | Health check |

## Deploy

- **Railway (backend):** root directory `backend`. It builds from the `Dockerfile` and uses `/api/health` as the health check. Set `DATABASE_URL`, `ALLOWED_ORIGIN`, and `PUSH_CONTACT_EMAIL`.
- **Vercel (frontend):** root directory `frontend`. Set `NEXT_PUBLIC_API_URL` to the Railway URL plus `/api`.
- **Supabase:** use the Session pooler connection string on Railway (the direct host is IPv6-only).

## Scripts

Run from `backend/`:

| Command | Purpose |
|---|---|
| `npm test` | Run the test suite |
| `npm run scrape` | One hourly-style scrape, then exit |
| `node scripts/dry-run-scrapers.js [name]` | Run scrapers against live sources without a database and print counts |
| `node scripts/e2e-local.js [--wide]` | Run the full pipeline against the database in `DATABASE_URL` and print per-source counts |
| `node scripts/repair-watchlist.js [--errors-only]` | Re-detect the ATS for watchlist companies that are failing |
| `node scripts/validate-ats-slugs.js [--fix-career]` | Check the preset companies' ATS slugs |
| `node scripts/sync-preset-overrides.js` | Write `presets/atsOverrides.js` fixes back into the preset files |
| `node scripts/discover-companies-from-wdc.js` | Build the Web Data Commons preset list |

## Project layout

```
backend/
  src/
    server.js        REST API
    db.js            Postgres schema, migrations, queries
    scheduler.js     cron schedule for everything below
    fastPoll.js      15-minute ATS poll and closed-listing check
    wideSweep.js     6-hour sweep over the public ATS directory
    scraper.js       hourly run of career sites and job boards
    scrapeOnce.js    entry point for `npm run scrape`
    scrapers/        one file per source
    watchers/        company watchlist checks and shared ATS fetchers
    utils/           filters, role classification, company discovery, push
    presets/         watchlist company lists
  scripts/           maintenance and check scripts (table above)
  Dockerfile, railway.json
frontend/
  src/app/           dashboard (page.tsx) and settings page
  src/components/    watchlist panel, footer
  src/lib/api.ts     API client
  public/sw.js       service worker for push notifications
docs/                design notes and plans for past features
```

## License

MIT. Job data belongs to the original sources.

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
