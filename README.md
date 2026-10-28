# Job Hunter Pro

A self-hosted job aggregator for US tech roles. It pulls listings from company job boards and public job sites into one dashboard where you can filter, save, and track applications. You still apply on the company's site.

## Job sources

- **Company ATS boards** (every 15 min): Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Recruitee. Companies come from a seed list plus the ATS links found in SimplifyJobs listings.
- **Job sites** (hourly): SimplifyJobs, Himalayas, RemoteOK, Remotive, We Work Remotely, The Muse, Jobicy, Hacker News "Who is hiring?"
- **Optional, needs API keys** (every 12h): JSearch, Fantastic.jobs, Adzuna

## Features

- Filter by role (SWE, frontend, backend, full stack, AI, ML, data, DevOps), experience, and posting age
- US locations only; skips roles that require US citizenship
- Jobs that disappear from an ATS board for two checks are marked closed
- Flags reposted jobs
- Save / applied / hidden status and notes per job
- Company watchlist with browser push alerts for new roles

## Stack

Node.js 20 + Express, Postgres (Supabase), node-cron, Vitest · Next.js 15 + React 19 + Tailwind · deployed on Railway, Vercel, Supabase

## Setup

You need Node.js 20+ and a Postgres database (a free Supabase project works).

Backend:

```bash
cd backend
cp .env.example .env   # set DATABASE_URL
npm install
npm run dev            # http://localhost:4000, tables are created on first start
```

Frontend:

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev            # http://localhost:3000
```

Click **Sync Now** in the dashboard to run a scrape, or wait for the scheduler.

## Environment variables

Backend (`backend/.env`):

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `ALLOWED_ORIGIN` | In production | Frontend URL for CORS |
| `PUSH_CONTACT_EMAIL` | For push alerts | Contact email for Web Push |
| `RAPIDAPI_KEY` | No | JSearch |
| `FANTASTIC_API_KEY` | No | Fantastic.jobs |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | No | Adzuna |
| `MUSE_API_KEY` | No | Higher rate limit for The Muse |

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_API_URL`, defaults to `http://localhost:4000/api`.

## Deploy

- **Railway (backend):** root directory `backend`, set `DATABASE_URL`, `ALLOWED_ORIGIN`, `PUSH_CONTACT_EMAIL`.
- **Vercel (frontend):** root directory `frontend`, set `NEXT_PUBLIC_API_URL` to the Railway URL plus `/api`.

## Scripts

```bash
cd backend
npm test                                  # run tests
npm run scrape                            # one scrape run, then exit
node scripts/dry-run-scrapers.js [name]   # test scrapers against live sources, no DB
node scripts/e2e-local.js                 # full pipeline against the DB in DATABASE_URL
node scripts/repair-watchlist.js --errors-only
node scripts/discover-companies-from-wdc.js
```

## Project layout

```
backend/src/
  server.js      REST API
  db.js          Postgres queries and migrations
  scraper.js     hourly job-site scrape
  fastPoll.js    15-minute ATS poll + closed-listing check
  scheduler.js   cron setup
  scrapers/      one file per source
  watchers/      company watchlist
  utils/         filters, company discovery, helpers
  presets/       company lists for the watchlist
frontend/src/    Next.js dashboard
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
