<div align="center">

# 🎯 Job Hunter Pro

**A self-hosted job aggregator built for 2026 new grads — faster than any job board.**

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.42-45ba4b?logo=playwright)](https://playwright.dev)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*Scrapes LinkedIn, Indeed, Greenhouse, Lever, Workday & 50+ company career pages every 4 hours.*

</div>

---

## 🚀 What is this?

The job market for 2026 new grads is competitive. Being 5 minutes faster than other applicants can make the difference. **Job Hunter Pro** is a personal tool that:

- **Scrapes 6 sources + 80+ companies** every 4 hours, automatically
- Shows you **only new grad / entry-level** roles (senior/staff filtered out)
- Surfaces jobs **the moment they go live** with a pulsing 🔵 NEW badge
- Tracks your applications: **Save → Apply → Done**
- Runs entirely **on your own machine or a free cloud server** — no subscriptions

> Built because existing job boards like JobRight and LinkedIn don't let you control *when* or *how granularly* they search for new grad roles.

---

## 📸 Screenshots

| Dashboard | Filters & Categories |
|---|---|
| Dark-mode job board with real-time stats | Filter by AI/ML, SWE, Data — or by source |

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔄 **Auto-scrape** | Runs every 4 hours via node-cron — zero manual effort |
| 🔵 **NEW badge** | Jobs you haven't seen yet pulse with a blue glow |
| 🤖 **AI/ML / 💻 SWE / 📊 Data** | Automatic role categorization |
| 🏢 **80+ companies** | OpenAI, Anthropic, Google, Meta, Apple, Stripe, Databricks, SpaceX & more |
| 🔍 **Deduplication** | Same posting from different sources? Stored once |
| ✅ **Apply tracking** | Mark jobs as Saved / Applied / Hidden |
| 🚀 **Scrape on demand** | Don't want to wait 4 hours? Hit "Scrape Now" |
| ⚙️ **Configurable** | Edit keywords, interval, and filters from the Settings page |

---

## 🗂️ Project Structure

```
job-hunter-pro/
├── backend/                  # Node.js scraper + REST API
│   ├── src/
│   │   ├── scrapers/
│   │   │   ├── linkedin.js   # Playwright — mimics human browsing
│   │   │   ├── indeed.js     # Playwright
│   │   │   ├── greenhouse.js # Public JSON API (30+ companies)
│   │   │   ├── lever.js      # Public JSON API (30+ companies)
│   │   │   ├── workday.js    # REST API (FAANG + 20 more)
│   │   │   └── direct.js    # Direct career pages
│   │   ├── db.js             # SQLite schema + prepared statements
│   │   ├── scraper.js        # Orchestrator (parallel + browser)
│   │   ├── scheduler.js      # node-cron every 4 hours
│   │   └── server.js         # Express REST API (port 4000)
│   ├── Dockerfile            # Playwright-ready Docker image
│   └── railway.json          # Railway deployment config
│
└── frontend/                 # Next.js 15 dashboard
    └── src/
        ├── app/
        │   ├── page.tsx          # Main dashboard
        │   └── settings/page.tsx # Settings page
        └── lib/api.ts            # Typed API client
```

---

## ⚡ Quick Start (Local)

### Prerequisites
- Node.js 20+
- Git

### 1. Clone the repo
```bash
git clone https://github.com/Saidheerajgollu/job-hunter-project.git
cd job-hunter-project
```

### 2. Start the backend
```bash
cd backend
npm install
npx playwright install chromium   # one-time browser download
node src/server.js
```
> API runs at **http://localhost:4000**. On first start it immediately scrapes all sources.

### 3. Start the frontend
```bash
cd frontend
npm install
npm run dev
```
> Dashboard at **http://localhost:3000** 🎉

---

## ☁️ Deploy to the Web (Free)

| Part | Platform | Cost |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Free |
| Backend (Node.js + Playwright) | **Railway** | Free ($5 credit/mo) |

### Backend → Railway
1. New Project → Deploy from GitHub → select this repo
2. Set **Root Directory** = `backend`
3. Railway auto-detects the `Dockerfile` (Playwright + Chromium pre-installed)
4. Add env var: `PORT=4000`
5. Generate a public domain → copy the URL

### Frontend → Vercel
1. New Project → import this repo
2. Set **Root Directory** = `frontend`
3. Add env var: `NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-URL/api`

> 💡 Add a Railway **Volume** mounted at `/app/data` to persist the SQLite DB across redeployments.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/jobs` | List jobs — supports `?status=`, `?category=`, `?source=`, `?search=`, `?page=` |
| `PATCH` | `/api/jobs/:id/status` | Update status (`new`, `saved`, `applied`, `ignored`) |
| `POST` | `/api/jobs/mark-seen` | Mark all new jobs as seen |
| `GET` | `/api/stats` | Dashboard stats + last scrape info |
| `POST` | `/api/scrape/run` | Trigger a manual scrape |
| `GET/POST` | `/api/settings` | Read or update settings (keywords, interval, filters) |
| `GET` | `/api/health` | Health check |

---

## 🏢 Companies Covered

| Category | Companies |
|---|---|
| **AI / ML** | OpenAI, Anthropic, Cohere, Hugging Face, Scale AI, Perplexity, Mistral, Together AI, Adept, Inflection |
| **Big Tech** | Google, Meta, Apple, Microsoft, Amazon, Nvidia, AMD, Intel, Qualcomm |
| **Cloud / Data** | Databricks, Snowflake, Cloudflare, Datadog, MongoDB, dbt Labs, Fivetran, Airbyte |
| **SWE** | Stripe, Figma, Notion, Airbnb, DoorDash, Lyft, Robinhood, Brex, Gusto, Plaid, Canva, Discord |
| **Other** | SpaceX, Tesla, Palantir, Ramp, Rippling, Vercel, Linear, Coinbase, Duolingo |
| **+ More** | 30+ additional via Greenhouse & Lever API auto-discovery |

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Scraping | Playwright (Chromium headless) + native `fetch` |
| Database | SQLite via better-sqlite3 |
| Scheduler | node-cron |
| API | Express.js |
| Frontend | Next.js 15 (App Router) + vanilla CSS |
| Deployment | Docker (Railway) + Vercel |

---

## 📄 License

MIT — use it, fork it, make it yours.

---

<div align="center">
Built by <a href="https://github.com/Saidheerajgollu">Saidheerajgollu</a> — May 2026 grad, tired of missing jobs by hours.
</div>
