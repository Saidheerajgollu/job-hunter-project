'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Job, Stats, JobFilters, H1bMeta } from '@/lib/api';
import { WatchlistPanel, NotificationBell } from '@/components/WatchlistPanel';
import { ReachOutFooter } from '@/components/ReachOutFooter';

// ── Utility ───────────────────────────────────────────────────────────────────

function toUTC(dateStr: string): Date {
    if (!dateStr) return new Date(NaN);
    if (dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)) {
        return new Date(dateStr);
    }
    return new Date(dateStr.replace(' ', 'T') + 'Z');
}

function timeAgo(dateStr: string) {
    const d = toUTC(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(dateStr: string) {
    if (!dateStr) return 'Date unknown';
    const d = toUTC(dateStr);
    if (isNaN(d.getTime())) return 'Date unknown';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A calendar date ("2026-04-01") shown as-is — no time-zone shift to the day before. */
function formatDay(ymd: string) {
    const d = new Date(`${ymd}T00:00:00Z`);
    if (isNaN(d.getTime())) return 'Date unknown';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "H-1B: 1,240 filings FY25–26 · last filed Jun 2026", "H-1B: no data available", or null (no data imported). */
function formatH1b(h1b: Job['h1b']): string | null {
    if (h1b === null || h1b === undefined) return null;
    if (h1b === 'none') return 'H-1B: no data available';
    const n = h1b.filings.toLocaleString();
    const word = h1b.filings === 1 ? 'filing' : 'filings';
    let last = '';
    if (h1b.last_filed) {
        const [y, m] = h1b.last_filed.split('-');
        last = ` · last filed ${MONTHS[Number(m) - 1]} ${y}`;
    }
    return `H-1B: ${n} ${word} ${h1b.fiscal_years}${last}`;
}

function getCompanyInitials(company: string) {
    return company.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = ['1B4965', '2D6A4F', 'BC6C25', 'C41E3A', '4A4740', '7A756C'];
function getCompanyColor(company: string) {
    const hash = company.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return COLORS[hash % COLORS.length];
}

function formatSource(source: string) {
    const labels: Record<string, string> = {
        greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workday: 'Workday',
        simplifyjobs: 'SimplifyJobs', jsearch: 'JSearch', fantasticjobs: 'Fantastic.jobs',
        remoteok: 'RemoteOK', remotive: 'Remotive', adzuna: 'Adzuna', direct: 'Direct',
        himalayas: 'Himalayas', weworkremotely: 'WWR',
        smartrecruiters: 'SmartRecruiters', workable: 'Workable', recruitee: 'Recruitee',
        'schema-org': 'Schema.org',
        hackernews: 'HN Hiring', themuse: 'The Muse', jobicy: 'Jobicy',
        amazon: 'Amazon', apple: 'Apple', google: 'Google', eightfold: 'Eightfold',
        bytedance: 'TikTok/ByteDance', oraclecloud: 'Oracle Cloud',
    };
    return labels[source] || source;
}

function shouldShowSourceBadge(source: string) {
    return !source?.toLowerCase().includes('simplify');
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastItem { id: number; msg: string; type: 'success' | 'error'; }

function useToast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const counter = useRef(0);

    const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
        const id = ++counter.current;
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }, []);

    return { toasts, show };
}

// ── StatsBar ──────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: Stats | null }) {
    const run = stats?.last_run;
    const lastRunTime = run?.running
        ? 'Syncing now'
        : run?.finished_at ? timeAgo(run.finished_at) : '—';

    const items = [
        { label: 'Open jobs', value: stats?.total?.toLocaleString() ?? '—' },
        { label: 'Last 24h', value: stats?.last_24h?.toLocaleString() ?? '—' },
        { label: 'Last 7 days', value: stats?.last_7d?.toLocaleString() ?? '—' },
        { label: 'Companies', value: stats?.companies?.toLocaleString() ?? '—' },
        { label: 'Last sync', value: lastRunTime, small: true },
    ];

    return (
        <div className="stats-bar">
            {items.map((item) => (
                <div key={item.label} className="stat-card">
                    <div className={`stat-value${item.small ? ' stat-value-sm' : ''}`}>
                        {item.value}
                    </div>
                    <div className="stat-label">{item.label}</div>
                </div>
            ))}
        </div>
    );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

interface FilterBarProps {
    filters: JobFilters;
    onChange: (f: Partial<JobFilters>) => void;
    onScrape: () => void;
    scraping: boolean;
    /** True once H-1B data has been imported; hides the "H-1B sponsors only" chip until then. */
    h1bAvailable: boolean;
}

const CATEGORIES = [
    { value: '', label: 'All roles' },
    { value: 'swe', label: 'Software Eng' },
    { value: 'frontend', label: 'Frontend' },
    { value: 'backend', label: 'Backend' },
    { value: 'fullstack', label: 'Full Stack' },
    { value: 'ai', label: 'AI Engineer' },
    { value: 'ml', label: 'ML Engineer' },
    { value: 'data-science', label: 'Data Science' },
    { value: 'data-engineer', label: 'Data Engineer' },
    { value: 'data-analyst', label: 'Data Analyst' },
    { value: 'devops', label: 'DevOps / Cloud' },
];

const LOCATION_FILTERS = [
    { value: '1', label: 'US only' },
    { value: '0', label: 'All locations' },
];

const EXPERIENCE_LEVELS = [
    { value: '', label: 'Any exp' },
    { value: '1', label: '1 yr' },
    { value: '2', label: '2 yr' },
    { value: '3', label: '3 yr' },
    { value: '4', label: '4 yr' },
    { value: '5', label: '5+ yr' },
];

const SOURCES = [
    { value: '', label: 'All sources' },
    { value: 'greenhouse', label: 'Greenhouse' },
    { value: 'lever', label: 'Lever' },
    { value: 'ashby', label: 'Ashby' },
    { value: 'smartrecruiters', label: 'SmartRecruiters' },
    { value: 'workable', label: 'Workable' },
    { value: 'recruitee', label: 'Recruitee' },
    { value: 'schema-org', label: 'Schema.org' },
    { value: 'workday', label: 'Workday' },
    { value: 'simplifyjobs', label: 'SimplifyJobs' },
    { value: 'jsearch', label: 'JSearch' },
    { value: 'remoteok', label: 'RemoteOK' },
    { value: 'remotive', label: 'Remotive' },
    { value: 'adzuna', label: 'Adzuna' },
    { value: 'himalayas', label: 'Himalayas' },
    { value: 'weworkremotely', label: 'WWR' },
    { value: 'hackernews', label: 'HN Hiring' },
    { value: 'themuse', label: 'The Muse' },
    { value: 'jobicy', label: 'Jobicy' },
    { value: 'amazon', label: 'Amazon' },
    { value: 'apple', label: 'Apple' },
    { value: 'google', label: 'Google' },
    { value: 'eightfold', label: 'Eightfold (Netflix, Microsoft…)' },
    { value: 'bytedance', label: 'TikTok/ByteDance' },
    { value: 'oraclecloud', label: 'Oracle Cloud (JPMorgan…)' },
];

function FilterBar({ filters, onChange, onScrape, scraping, h1bAvailable }: FilterBarProps) {
    const [search, setSearch] = useState(filters.search || '');
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    function handleSearch(val: string) {
        setSearch(val);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onChange({ search: val, page: 1 }), 400);
    }

    function toggleAge(ageKey: 'fresh_only' | 'max_age_days', val: string) {
        const isActive =
            ageKey === 'fresh_only' ? filters.fresh_only === '1'
            : filters.max_age_days === val;

        if (isActive) {
            onChange({ fresh_only: '', max_age_days: '', page: 1 });
        } else {
            onChange({
                fresh_only: ageKey === 'fresh_only' ? '1' : '',
                max_age_days: ageKey === 'max_age_days' ? val : '',
                page: 1,
            });
        }
    }

    return (
        <div className="filter-panel">
            <div className="filter-row filter-row-top">
                <div className="search-input-wrapper">
                    <input
                        className="search-input"
                        placeholder="Search title or company..."
                        value={search}
                        onChange={e => handleSearch(e.target.value)}
                        suppressHydrationWarning
                    />
                </div>
                <select
                    className="source-select"
                    value={filters.source || ''}
                    onChange={e => onChange({ source: e.target.value, page: 1 })}
                    aria-label="Filter by source"
                >
                    {SOURCES.map(s => (
                        <option key={s.value || 'all'} value={s.value}>{s.label}</option>
                    ))}
                </select>
                <button
                    className="btn btn-primary"
                    onClick={onScrape}
                    disabled={scraping}
                >
                    {scraping ? 'Syncing…' : 'Sync now'}
                </button>
            </div>

            {/* Role filter row — matches title keywords (e.g. "Senior Software Engineer") */}
            <div className="filter-row">
                <span className="filter-chips-label">Role</span>
                <div className="filter-chips">
                    {CATEGORIES.map(c => (
                        <button
                            key={c.value}
                            className={`chip ${filters.category === c.value ? 'active' : ''}`}
                            onClick={() => onChange({ category: c.value, role: c.value, page: 1 })}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Location filter row */}
            <div className="filter-row">
                <span className="filter-chips-label">Location</span>
                <div className="filter-chips">
                    {LOCATION_FILTERS.map(loc => {
                        const active = (filters.us_only ?? '1') === loc.value;
                        return (
                            <button
                                key={loc.value}
                                className={`chip ${active ? 'active' : ''}`}
                                onClick={() => onChange({ us_only: loc.value, page: 1 })}
                            >
                                {loc.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Experience filter row */}
            <div className="filter-row">
                <span className="filter-chips-label">Exp</span>
                <div className="filter-chips">
                    {EXPERIENCE_LEVELS.map(e => (
                        <button
                            key={e.value || 'any'}
                            className={`chip ${(filters.experience || '') === e.value ? 'active' : ''}`}
                            onClick={() => onChange({ experience: e.value, page: 1 })}
                        >
                            {e.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Time + extras row */}
            <div className="filter-row">
                <span className="filter-chips-label">Filter</span>
                <div className="filter-chips">
                    <button
                        className={`chip chip-fresh ${filters.fresh_only === '1' ? 'active' : ''}`}
                        onClick={() => toggleAge('fresh_only', '1')}
                        title="Posted on the company portal in the last 24 hours"
                    >
                        Last 24h
                    </button>
                    <button
                        className={`chip chip-week ${filters.max_age_days === '7' ? 'active' : ''}`}
                        onClick={() => toggleAge('max_age_days', '7')}
                        title="Posted on the portal in the last 7 days"
                    >
                        This week
                    </button>
                    <button
                        className={`chip chip-month ${filters.max_age_days === '30' ? 'active' : ''}`}
                        onClick={() => toggleAge('max_age_days', '30')}
                        title="Posted on the portal in the last 30 days (default)"
                    >
                        This month
                    </button>
                    <button
                        className={`chip chip-salary ${filters.has_salary === '1' ? 'active' : ''}`}
                        onClick={() => onChange({ has_salary: filters.has_salary === '1' ? '' : '1', page: 1 })}
                        title="Only show jobs with salary info"
                    >
                        Has salary
                    </button>
                    <button
                        className={`chip chip-visa ${filters.hide_no_sponsorship === '1' ? 'active' : ''}`}
                        onClick={() => onChange({ hide_no_sponsorship: filters.hide_no_sponsorship === '1' ? '' : '1', page: 1 })}
                        title="Hide jobs whose posting says no visa sponsorship"
                    >
                        Hide no-sponsorship
                    </button>
                    {h1bAvailable && (
                        <button
                            className={`chip chip-visa ${filters.h1b_only === '1' ? 'active' : ''}`}
                            onClick={() => onChange({ h1b_only: filters.h1b_only === '1' ? '' : '1', page: 1 })}
                            title="Only companies with certified H-1B filings in FY25–26"
                        >
                            H-1B sponsors only
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── JobCard ───────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: Job }) {
    const initials = getCompanyInitials(job.company);
    const color = getCompanyColor(job.company);
    const [expanded, setExpanded] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);

    const catLabel =
        job.category === 'ai' ? 'AI Eng' :
        job.category === 'ml' ? 'ML Eng' :
        job.category === 'data-science' ? 'Data Sci' :
        job.category === 'data-engineer' ? 'Data Eng' :
        job.category === 'data-analyst' ? 'Data Analyst' :
        job.category === 'fullstack' ? 'Full Stack' :
        job.category === 'devops' ? 'DevOps' :
        job.category?.charAt(0).toUpperCase() + job.category?.slice(1);

    return (
        <div className="job-card-wrap">
            <div className="job-card">
                <div className="company-logo" style={{ color: `#${color}` }}>
                    <img
                        src={`https://logo.clearbit.com/${encodeURIComponent(job.company.toLowerCase().replace(/\s/g, ''))}.com`}
                        alt={job.company}
                        onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling!.textContent = initials;
                        }}
                    />
                    <span style={{ display: 'none' }}>{initials}</span>
                </div>

                <div className="job-info">
                    <div className="job-title">{job.title}</div>
                    <div className="job-company">{job.company}</div>
                    <div className="job-meta">
                        {job.location && <span className="job-meta-item">{job.location}</span>}
                        {job.salary && <span className="job-meta-item">{job.salary}</span>}
                        {job.is_reposted === 1 ? (
                            <>
                                <span className="job-meta-item">
                                    Portal {formatDate(job.posted_at || job.scraped_at)}
                                </span>
                                {job.previous_posted_at && (
                                    <span className="job-meta-item">
                                        Was {formatDate(job.previous_posted_at)}
                                    </span>
                                )}
                                {job.reposted_at && (
                                    <span className="job-meta-item">
                                        Reposted {formatDate(job.reposted_at)}
                                    </span>
                                )}
                            </>
                        ) : (
                            <span className="job-meta-item">
                                Posted {formatDate(job.posted_at || job.scraped_at)}
                            </span>
                        )}
                        <span className="job-meta-item">Synced {timeAgo(job.scraped_at)}</span>
                        {job.visa_wording === 'no_sponsorship' && (
                            <span className="badge badge-no-sponsor" title="The posting says the company won't sponsor a visa">No sponsorship</span>
                        )}
                        {job.visa_wording === 'sponsors' && (
                            <span className="badge badge-sponsors" title="The posting says visa sponsorship is available">Sponsors visas</span>
                        )}
                        {formatH1b(job.h1b) && (
                            <span className={`job-meta-item job-h1b${job.h1b === 'none' ? ' job-h1b-none' : ''}`}
                                title="Certified H-1B applications (LCAs) filed by this company, from US Dept. of Labor data">
                                {formatH1b(job.h1b)}
                            </span>
                        )}
                    </div>
                </div>

                <div className="job-badges">
                    {job.closed_at && <span className="badge badge-closed">Listing closed</span>}
                    {job.is_fresh === 1 && <span className="badge badge-fresh">Recent</span>}
                    {job.is_reposted === 1 && <span className="badge badge-reposted">Reposted</span>}
                    {shouldShowSourceBadge(job.source) && (
                        <span className="badge badge-source">{formatSource(job.source)}</span>
                    )}
                    <span className={`badge badge-cat-${job.category}`}>{catLabel}</span>
                </div>

                <div className="job-actions">
                    <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary btn-sm"
                    >
                        Apply ↗
                    </a>

                    {job.description && (
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExpanded(e => !e)}
                            title={expanded ? 'Hide description' : 'Show description'}
                            style={{ padding: '5px 7px' }}
                        >
                            {expanded ? '▲' : '▼'}
                        </button>
                    )}
                </div>
            </div>

            {expanded && job.description && (
                <div className="job-expand-panel">
                    {job.description && (
                        <div>
                            <div className={`job-description-text ${descExpanded ? '' : 'collapsed'}`}>
                                {job.description}
                            </div>
                            <button
                                className="job-desc-toggle"
                                onClick={() => setDescExpanded(d => !d)}
                            >
                                {descExpanded ? 'Show less' : 'Show full description'}
                            </button>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}

export default function Home() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<Stats | null>(null);
    const [h1bMeta, setH1bMeta] = useState<H1bMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [filters, setFilters] = useState<JobFilters>({ page: 1, limit: 30, us_only: '1', max_age_days: '30' });
    const [gradLabel, setGradLabel] = useState('2026 new grad');
    const { toasts, show: showToast } = useToast();

    const fetchJobs = useCallback(async (f: JobFilters, { quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        try {
            const res = await api.getJobs(f);
            setJobs(res.jobs);
            setTotal(res.total);
            setLoadError(false);
        } catch {
            // Keep whatever is on screen; only a first load with nothing shows the error state.
            setLoadError(true);
            if (!quiet) showToast('Failed to load jobs. Try again in a minute.', 'error');
        } finally {
            if (!quiet) setLoading(false);
        }
    }, [showToast]);

    const fetchStats = useCallback(async () => {
        try {
            const s = await api.getStats();
            setStats(s);
        } catch { /* ignore */ }
    }, []);

    // H-1B data source info (changes only on a quarterly import).
    useEffect(() => {
        api.getH1bMeta().then(setH1bMeta).catch(() => {});
    }, []);

    // Fetch grad label from settings (cheap, one-time)
    useEffect(() => {
        api.getSettings().then(s => {
            if (s.grad_label) setGradLabel(s.grad_label);
        }).catch(() => {});
    }, []);

    // Scrapers add jobs all day (ATS boards every 15 min, career sites hourly,
    // wide sweep every 6h), so refresh in the background: stats every 30s,
    // the job list every 5 min.
    useEffect(() => {
        fetchJobs(filters);
        fetchStats();
        const statsTimer = setInterval(fetchStats, 30000);
        const jobsTimer = setInterval(() => fetchJobs(filters, { quiet: true }), 5 * 60 * 1000);
        return () => { clearInterval(statsTimer); clearInterval(jobsTimer); };
    }, [fetchJobs, fetchStats, filters]);

    function handleFilterChange(partial: Partial<JobFilters>) {
        setFilters(prev => ({ ...prev, ...partial }));
    }

    async function handleScrape() {
        setScraping(true);
        try {
            await api.triggerScrape();
            showToast('Sync started — new jobs appear in a few minutes.', 'success');
            setTimeout(() => { fetchJobs(filters); fetchStats(); }, 5000);
        } catch {
            showToast('Failed to trigger scrape', 'error');
        } finally {
            setTimeout(() => setScraping(false), 3000);
        }
    }

    const totalPages = Math.ceil(total / (filters.limit || 30));
    const currentPage = filters.page || 1;

    return (
        <div className="app-layout">
            <nav className="navbar">
                <div className="grid-container navbar-inner">
                    <a href="/" className="navbar-brand">
                        <span className="navbar-brand-mark" aria-hidden />
                        Job Hunter
                    </a>
                    <div className="navbar-actions">
                        <span className="navbar-tag">{gradLabel}</span>
                        <span className="navbar-divider" aria-hidden />
                        <a href="/settings" className="btn btn-ghost btn-sm">Settings</a>
                    </div>
                </div>
            </nav>

            <main className="main-content grid-container">
                <div className="page-header">
                    <div>
                        <p className="page-meta">Shared feed · updated automatically</p>
                        <h1 className="page-title">Jobs</h1>
                        <p className="page-subtitle">
                            US-located roles — hides US-citizenship-only jobs (sponsorship not required).
                        </p>
                    </div>
                    <div className="page-actions">
                        <NotificationBell />
                    </div>
                </div>

                {/* Stats */}
                <StatsBar stats={stats} />
                {h1bMeta?.imported_at && (
                    <p className="data-footnote">
                        H-1B data: US Dept. of Labor LCA filings,{' '}
                        {h1bMeta.min_fy === h1bMeta.max_fy ? `FY${h1bMeta.max_fy}` : `FY${h1bMeta.min_fy}–FY${h1bMeta.max_fy}`}
                        {h1bMeta.latest_decision ? ` (through ${formatDay(h1bMeta.latest_decision)})` : ''},
                        updated {formatDate(h1bMeta.imported_at)}. Counts certified H-1B applications only.
                    </p>
                )}

                <div className="toolbar">
                    <span className="result-count">
                        {total.toLocaleString()} result{total !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Filters */}
                <FilterBar
                    filters={filters}
                    onChange={handleFilterChange}
                    onScrape={handleScrape}
                    scraping={scraping}
                    h1bAvailable={!!h1bMeta?.imported_at}
                />

                {/* Watchlist */}
                <WatchlistPanel />

                {/* Jobs */}
                {loading ? (
                    <div className="loading-wrapper">
                        <div className="spinner" />
                        <span>Loading jobs…</span>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">0</div>
                        <div className="empty-title">{loadError ? 'Jobs failed to load' : 'No jobs found'}</div>
                        <div className="empty-desc">
                            {loadError
                                ? 'Could not reach the job server. It may be restarting — try again in a minute.'
                                : Object.keys(filters).filter(k => filters[k as keyof JobFilters]).length > 2
                                ? 'Try adjusting your filters or sync to fetch the latest listings.'
                                : 'Run a sync to pull fresh roles from Greenhouse, Lever, Ashby, and more.'}
                        </div>
                        <button className="btn btn-primary" onClick={handleScrape} disabled={scraping}>
                            {scraping ? 'Syncing…' : 'Sync now'}
                        </button>
                    </div>
                ) : (
                    <div className="jobs-grid">
                        {jobs.map(job => (
                            <JobCard key={job.id} job={job} />
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="pagination">
                        <button
                            className="page-btn"
                            disabled={currentPage === 1}
                            onClick={() => handleFilterChange({ page: currentPage - 1 })}
                        >
                            ‹
                        </button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            const p = currentPage <= 4 ? i + 1 : currentPage - 3 + i;
                            if (p < 1 || p > totalPages) return null;
                            return (
                                <button
                                    key={p}
                                    className={`page-btn ${p === currentPage ? 'active' : ''}`}
                                    onClick={() => handleFilterChange({ page: p })}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            className="page-btn"
                            disabled={currentPage === totalPages}
                            onClick={() => handleFilterChange({ page: currentPage + 1 })}
                        >
                            ›
                        </button>
                    </div>
                )}

                <ReachOutFooter />

                <footer className="page-footer-rule">
                    <span>{total.toLocaleString()} indexed</span>
                </footer>
            </main>

            {/* Toast notifications */}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type}`}>
                        {t.msg}
                    </div>
                ))}
            </div>
        </div>
    );
}
