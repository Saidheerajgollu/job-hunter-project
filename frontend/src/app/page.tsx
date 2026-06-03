'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Job, Stats, JobFilters } from '@/lib/api';
import { WatchlistPanel, NotificationBell } from '@/components/WatchlistPanel';

// ── Utility ───────────────────────────────────────────────────────────────────

// SQLite stores UTC datetimes without 'Z' (e.g. "2026-03-19 21:43:01").
// JS parses those as local time, making them hours off. Fix by normalizing to UTC.
function toUTC(dateStr: string): Date {
    if (!dateStr) return new Date(NaN);
    // Already has timezone info — parse as-is
    if (dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)) {
        return new Date(dateStr);
    }
    // SQLite format: "YYYY-MM-DD HH:MM:SS" → treat as UTC
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

function getCompanyInitials(company: string) {
    return company.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = ['4c6ef5', '20c997', 'fd7e14', 'fa5252', '9b59b6', 'f59f00', '0ca678', 'e64980'];
function getCompanyColor(company: string) {
    const hash = company.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return COLORS[hash % COLORS.length];
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
    const lastRunTime = stats?.last_run?.finished_at
        ? timeAgo(stats.last_run.finished_at)
        : 'Never';

    const items = [
        { label: 'Total', value: stats?.total ?? '—' },
        { label: 'Unseen', value: stats?.new_count ?? '—' },
        { label: 'Last 24h', value: stats?.last_24h ?? '—' },
        { label: 'Applied', value: stats?.applied ?? '—' },
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

const SOURCES = [
    { value: '', label: 'All sources' },
    { value: 'greenhouse', label: 'Greenhouse' },
    { value: 'lever', label: 'Lever' },
    { value: 'ashby', label: 'Ashby' },
    { value: 'workday', label: 'Workday' },
    { value: 'simplifyjobs', label: 'SimplifyJobs' },
    { value: 'jsearch', label: 'JSearch' },
    { value: 'fantasticjobs', label: 'Fantastic.jobs' },
    { value: 'remoteok', label: 'RemoteOK' },
    { value: 'remotive', label: 'Remotive' },
    { value: 'adzuna', label: 'Adzuna' },
];


function FilterBar({ filters, onChange, onScrape, scraping }: FilterBarProps) {
    const [search, setSearch] = useState(filters.search || '');
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    function handleSearch(val: string) {
        setSearch(val);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onChange({ search: val, page: 1 }), 400);
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
            <div className="filter-row">
                <span className="filter-chips-label">Role</span>
                <div className="filter-chips">
                    <button
                        className={`chip chip-fresh ${filters.fresh_only === '1' ? 'active' : ''}`}
                        onClick={() => onChange({ fresh_only: filters.fresh_only === '1' ? '' : '1', page: 1 })}
                        title="Jobs found in the last 24 hours"
                    >
                        Today
                    </button>
                    {CATEGORIES.map(c => (
                        <button
                            key={c.value}
                            className={`chip ${filters.category === c.value ? 'active' : ''}`}
                            onClick={() => onChange({ category: c.value, page: 1 })}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── JobCard ───────────────────────────────────────────────────────────────────

function JobCard({
    job,
    onStatusChange,
}: {
    job: Job;
    onStatusChange: (id: string, status: string) => void;
}) {
    const initials = getCompanyInitials(job.company);
    const color = getCompanyColor(job.company);

    return (
        <div className={`job-card status-${job.status}`}>
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
                    <span className="job-meta-item">Posted {formatDate(job.posted_at || job.scraped_at)}</span>
                    <span className="job-meta-item">Synced {timeAgo(job.scraped_at)}</span>
                </div>
            </div>

            <div className="job-badges">
                {job.is_fresh === 1 && <span className="badge badge-fresh">Today</span>}
                {job.is_new === 1 && <span className="badge badge-new">New</span>}
                <span className="badge badge-source">{formatSource(job.source)}</span>
                <span className={`badge badge-cat-${job.category}`}>
                    {job.category === 'ai' ? 'AI Eng' :
                     job.category === 'ml' ? 'ML Eng' :
                     job.category === 'data-science' ? 'Data Sci' :
                     job.category === 'data-engineer' ? 'Data Eng' :
                     job.category === 'data-analyst' ? 'Data Analyst' :
                     job.category === 'fullstack' ? 'Full Stack' :
                     job.category === 'devops' ? 'DevOps' :
                     job.category?.charAt(0).toUpperCase() + job.category?.slice(1)}
                </span>

                {job.status === 'applied' && <span className="badge badge-applied">Applied</span>}
                {job.status === 'saved' && <span className="badge badge-saved">Saved</span>}
            </div>

            <div className="job-actions">
                <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                        if (job.status === 'new') onStatusChange(job.id, 'applied');
                    }}
                >
                    Apply
                </a>
                {job.status !== 'saved' && job.status !== 'applied' && (
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onStatusChange(job.id, 'saved')}
                    >
                        Save
                    </button>
                )}
                {job.status === 'applied' ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => onStatusChange(job.id, 'new')}>
                        Undo
                    </button>
                ) : (
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onStatusChange(job.id, 'ignored')}
                    >
                        Hide
                    </button>
                )}
            </div>
        </div>
    );
}

function formatSource(source: string) {
    const labels: Record<string, string> = {
        greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workday: 'Workday',
        simplifyjobs: 'SimplifyJobs', jsearch: 'JSearch', fantasticjobs: 'Fantastic.jobs',
        remoteok: 'RemoteOK', remotive: 'Remotive', adzuna: 'Adzuna', direct: 'Direct',
        himalayas: 'Himalayas', weworkremotely: 'WWR',
    };
    return labels[source] || source;
}

// ── Applied Tracker Banner ────────────────────────────────────────────────────

function AppliedBanner({ count }: { count: number }) {
    if (count === 0) return null;
    return (
        <div className="applied-banner">
            <div>
                <strong>{count} application{count !== 1 ? 's' : ''} tracked</strong>
                <span> — click Apply → on any job to auto-mark it here</span>
            </div>
        </div>
    );
}

const STATUS_TABS = [
    { value: '', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'saved', label: 'Saved' },
    { value: 'applied', label: 'Applied' },
    { value: 'ignored', label: 'Hidden' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [filters, setFilters] = useState<JobFilters>({ page: 1, limit: 30 });
    const { toasts, show: showToast } = useToast();

    const fetchJobs = useCallback(async (f: JobFilters) => {
        setLoading(true);
        try {
            const res = await api.getJobs(f);
            setJobs(res.jobs);
            setTotal(res.total);
        } catch {
            showToast('Failed to load jobs. Is the backend running?', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    const fetchStats = useCallback(async () => {
        try {
            const s = await api.getStats();
            setStats(s);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        fetchJobs(filters);
        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
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

    async function handleStatusChange(id: string, status: string) {
        try {
            await api.updateJobStatus(id, status);
            setJobs(prev => prev.map(j => j.id === id ? { ...j, status: status as Job['status'], is_new: 0 } : j));
            fetchStats();
        } catch {
            showToast('Failed to update status', 'error');
        }
    }

    const totalPages = Math.ceil(total / (filters.limit || 30));
    const currentPage = filters.page || 1;

    return (
        <div className="app-layout">
            {/* Navbar */}
            <nav className="navbar">
                <a href="/" className="navbar-brand">
                    <span className="navbar-brand-icon" aria-hidden />
                    Job Hunter
                </a>
                <div className="navbar-actions">
                    <span className="navbar-tag">2026 new grad</span>
                    <span className="navbar-divider" aria-hidden />
                    <a href="/settings" className="btn btn-ghost btn-sm">Settings</a>
                </div>
            </nav>

            <main className="main-content">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Jobs</h1>
                        <p className="page-subtitle">
                            New grad roles in AI, software, and data — synced hourly from 11 sources.
                        </p>
                    </div>
                    <div className="page-actions">
                        <NotificationBell />
                        {stats?.new_count ? (
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={async () => {
                                    await api.markAllSeen();
                                    setJobs(prev => prev.map(j => ({ ...j, is_new: 0 })));
                                    fetchStats();
                                }}
                            >
                                Mark all seen
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Stats */}
                <StatsBar stats={stats} />

                {/* Status Tabs */}
                <div className="toolbar">
                    <div className="status-tabs">
                        {STATUS_TABS.map(tab => (
                            <button
                                key={tab.value}
                                className={`status-tab ${(filters.status || '') === tab.value ? 'active' : ''}`}
                                onClick={() => handleFilterChange({ status: tab.value, page: 1 })}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <span className="result-count">
                        {total.toLocaleString()} result{total !== 1 ? 's' : ''}
                    </span>
                </div>

                {filters.status === 'applied' && <AppliedBanner count={stats?.applied ?? total} />}

                {/* Filters */}
                <FilterBar
                    filters={filters}
                    onChange={handleFilterChange}
                    onScrape={handleScrape}
                    scraping={scraping}
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
                        <div className="empty-icon">∅</div>
                        <div className="empty-title">No jobs found</div>
                        <div className="empty-desc">
                            {filters.status === 'applied'
                                ? 'No applications tracked yet. Click Apply on any job to mark it here.'
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
                            <JobCard key={job.id} job={job} onStatusChange={handleStatusChange} />
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
