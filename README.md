# 🎯 Job Hunter Pro

A personal job tracking dashboard for 2026 new grads — aggregates AI, SWE, and Data roles from across the web, automatically.

## Features

- Scrapes jobs every 4 hours, automatically
- Covers LinkedIn, Indeed, Greenhouse, Lever, Workday, SimplifyJobs & more
- Filters out senior/staff/principal roles
- 8 categories: Software Eng, Full Stack, AI Engineer, ML Engineer, Data Science, Data Engineer, Data Analyst, DevOps
- Shows posted date — sorted newest first
- Track jobs: Save, Apply, Hide
- On-demand "Scrape Now" button

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express |
| Scraping | Playwright + native fetch |
| Database | SQLite |
| Frontend | Next.js 15 |
| Scheduler | node-cron (every 4h) |

## Quick Start

```bash
# Backend
cd backend && npm install
npx playwright install chromium
node src/server.js

# Frontend (new terminal)
cd frontend && npm install
npm run dev
```

Open **http://localhost:3000**

## Deploy

- **Frontend** → Vercel (set `NEXT_PUBLIC_API_URL` to your backend URL)
- **Backend** → Railway (Dockerfile included, Chromium pre-installed)
- Optional: add `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` env vars for Adzuna coverage
