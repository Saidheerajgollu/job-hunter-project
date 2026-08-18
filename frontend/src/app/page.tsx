'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Job, Stats, JobFilters } from '@/lib/api';
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

function appliedDaysInfo(appliedAt: string | null): { label: string; cls: string } | null {
    if (!appliedAt) return null;
    const days = Math.floor((Date.now() - toUTC(appliedAt).getTime()) / 86400000);
    if (days === 0) return { label: 'Applied today', cls: 'fresh' };
    if (days <= 3) return { label: `Applied ${days}d ago`, cls: 'fresh' };
    if (days <= 7) return { label: `Applied ${days}d ago — follow up?`, cls: 'warning' };
    return { label: `Applied ${days}d ago — overdue follow-up`, cls: 'overdue' };
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
    { value: 'workday', label: 'Workday' },
    { value: 'simplifyjobs', label: 'SimplifyJobs' },
    { value: 'jsearch', label: 'JSearch' },
    { value: 'remoteok', label: 'RemoteOK' },
    { value: 'remotive', label: 'Remotive' },
    { value: 'adzuna', label: 'Adzuna' },
    { value: 'himalayas', label: 'Himalayas' },
    { value: 'weworkremotely', label: 'WWR' },
];

function FilterBar({ filters, onChange, onScrape, scraping }: FilterBarProps) {
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
                </div>
            </div>
        </div>
    );
}

// ── JobCard ───────────────────────────────────────────────────────────────────

function JobCard({
    job,
    onStatusChange,
    onNotesChange,
}: {
    job: Job;
    onStatusChange: (id: string, status: string) => void;
    onNotesChange: (id: string, notes: string) => void;
}) {
    const initials = getCompanyInitials(job.company);
    const color = getCompanyColor(job.company);
    const [expanded, setExpanded] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [localNotes, setLocalNotes] = useState(job.notes || '');
    const [notesSaved, setNotesSaved] = useState(false);
    const [notesSaving, setNotesSaving] = useState(false);

    // Keep local notes in sync if job prop changes (e.g. after re-fetch)
    useEffect(() => {
        setLocalNotes(job.notes || '');
    }, [job.notes]);

    async function saveNotes() {
        if (localNotes === (job.notes || '')) return;
        setNotesSaving(true);
        await onNotesChange(job.id, localNotes);
        setNotesSaving(false);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
    }

    const appliedInfo = appliedDaysInfo(job.applied_at);
    const hasContent = !!(job.description || true); // always show notes option

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
        <div className={`job-card-wrap status-${job.status}`}>
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
                    </div>
                    {appliedInfo && (
                        <span className={`applied-date ${appliedInfo.cls}`}>{appliedInfo.label}</span>
                    )}
                </div>

                <div className="job-badges">
                    {job.is_fresh === 1 && <span className="badge badge-fresh">Recent</span>}
                    {job.is_reposted === 1 && <span className="badge badge-reposted">Reposted</span>}
                    {job.is_new === 1 && <span className="badge badge-new">New</span>}
                    {shouldShowSourceBadge(job.source) && (
                        <span className="badge badge-source">{formatSource(job.source)}</span>
                    )}
                    <span className={`badge badge-cat-${job.category}`}>{catLabel}</span>
                    {job.status === 'applied' && <span className="badge badge-applied">Applied</span>}
                    {job.status === 'saved' && <span className="badge badge-saved">Saved</span>}
                </div>

                <div className="job-actions">
                    {/* External link — does NOT auto-mark applied */}
                    <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                    >
                        Apply ↗
                    </a>

                    {/* Explicit mark-applied button */}
                    {job.status !== 'applied' && (
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => onStatusChange(job.id, 'applied')}
                            title="Mark this job as applied"
                        >
                            Mark Applied
                        </button>
                    )}

                    {/* Save (only for new/ignored) */}
                    {job.status !== 'saved' && job.status !== 'applied' && (
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => onStatusChange(job.id, 'saved')}
                        >
                            Save
                        </button>
                    )}

                    {/* Undo or Hide */}
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

                    {/* Expand toggle for description + notes */}
                    {hasContent && (
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExpanded(e => !e)}
                            title={expanded ? 'Collapse' : 'Notes / Description'}
                            style={{ padding: '5px 7px' }}
                        >
                            {expanded ? '▲' : '▼'}
                        </button>
                    )}
                </div>
            </div>

            {expanded && (
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

                    <div className="job-notes-section">
                        <span className="job-notes-label">Notes</span>
                        <textarea
                            className="job-notes-textarea"
                            placeholder="Add notes — resume version, recruiter name, interview stage, follow-up date…"
                            value={localNotes}
                            onChange={e => setLocalNotes(e.target.value)}
                            onBlur={saveNotes}
                        />
                        <div className="job-notes-actions">
                            {notesSaved && <span className="job-notes-saved">Saved</span>}
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={saveNotes}
                                disabled={notesSaving || localNotes === (job.notes || '')}
                            >
                                {notesSaving ? 'Saving…' : 'Save note'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Applied Tracker Banner ────────────────────────────────────────────────────

function AppliedBanner({ count }: { count: number }) {
    if (count === 0) return null;
    return (
        <div className="applied-banner">
            <div>
                <strong>{count} application{count !== 1 ? 's' : ''} tracked</strong>
                <span> — click "Mark Applied" on any job to track it here</span>
            </div>
        </div>
    );
}

// ── Status Tabs ───────────────────────────────────────────────────────────────

const STATUS_TABS = [
    { value: '', label: 'All', countKey: 'total' as const },
    { value: 'new', label: 'New', countKey: 'count_new' as const },
    { value: 'saved', label: 'Saved', countKey: 'saved' as const },
    { value: 'applied', label: 'Applied', countKey: 'applied' as const },
    { value: 'ignored', label: 'Hidden', countKey: 'ignored' as const },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [filters, setFilters] = useState<JobFilters>({ page: 1, limit: 30, us_only: '1', max_age_days: '30' });
    const [gradLabel, setGradLabel] = useState('2026 new grad');
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

    // Fetch grad label from settings (cheap, one-time)
    useEffect(() => {
        api.getSettings().then(s => {
            if (s.grad_label) setGradLabel(s.grad_label);
        }).catch(() => {});
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
            setJobs(prev => prev.map(j =>
                j.id === id
                    ? { ...j, status: status as Job['status'], is_new: 0, applied_at: status === 'applied' && !j.applied_at ? new Date().toISOString() : j.applied_at }
                    : j
            ));
            fetchStats();
        } catch {
            showToast('Failed to update status', 'error');
        }
    }

    async function handleNotesChange(id: string, notes: string) {
        try {
            await api.updateJobNotes(id, notes || null);
            setJobs(prev => prev.map(j => j.id === id ? { ...j, notes: notes || null } : j));
        } catch {
            showToast('Failed to save notes', 'error');
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
                        <p className="page-meta">Modular feed · 11 sources</p>
                        <h1 className="page-title">Jobs</h1>
                        <p className="page-subtitle">
                            US-located roles — hides US-citizenship-only jobs (sponsorship not required).
                        </p>
                    </div>
                    <div className="page-actions">
                        <NotificationBell />
                        {(stats?.new_count ?? 0) > 0 && (
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
                        )}
                    </div>
                </div>

                {/* Stats */}
                <StatsBar stats={stats} />

                {/* Status Tabs */}
                <div className="toolbar">
                    <div className="status-tabs">
                        {STATUS_TABS.map(tab => {
                            const count = stats ? stats[tab.countKey] : null;
                            return (
                                <button
                                    key={tab.value}
                                    className={`status-tab ${(filters.status || '') === tab.value ? 'active' : ''}`}
                                    onClick={() => handleFilterChange({ status: tab.value, page: 1 })}
                                >
                                    {tab.label}
                                    {count != null && count > 0 && (
                                        <span className="tab-count">{count.toLocaleString()}</span>
                                    )}
                                </button>
                            );
                        })}
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
                        <div className="empty-icon">0</div>
                        <div className="empty-title">No jobs found</div>
                        <div className="empty-desc">
                            {filters.status === 'applied'
                                ? 'No applications tracked yet. Click "Mark Applied" on any job to track it here.'
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
                            <JobCard
                                key={job.id}
                                job={job}
                                onStatusChange={handleStatusChange}
                                onNotesChange={handleNotesChange}
                            />
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
