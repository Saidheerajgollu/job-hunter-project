'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Job, Stats, JobFilters } from '@/lib/api';

// ── Utility ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(dateStr: string) {
    if (!dateStr) return 'Date unknown';
    const d = new Date(dateStr);
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
        { icon: '🔍', label: 'Total Jobs', value: stats?.total ?? '—', color: '#4c6ef5' },
        { icon: '✨', label: '🆕 New (unseen)', value: stats?.new_count ?? '—', color: '#748ffc' },
        { icon: '📅', label: 'Last 24 Hours', value: stats?.last_24h ?? '—', color: '#20c997' },
        { icon: '✅', label: 'Applied', value: stats?.applied ?? '—', color: '#20c997' },
        { icon: '🕐', label: 'Last Scraped', value: lastRunTime, color: '#8892b0', isText: true },
    ];

    return (
        <div className="stats-bar">
            {items.map((item) => (
                <div key={item.label} className="stat-card">
                    <div className="stat-icon" style={{ background: `${item.color}22` }}>
                        {item.icon}
                    </div>
                    <div className="stat-value" style={item.isText ? { fontSize: '18px' } : {}}>
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
    { value: '', label: 'All' },
    { value: 'swe', label: '💻 Software Eng' },
    { value: 'fullstack', label: '🌐 Full Stack' },
    { value: 'ai', label: '🤖 AI Engineer' },
    { value: 'ml', label: '🧠 ML Engineer' },
    { value: 'data-science', label: '📊 Data Science' },
    { value: 'data-engineer', label: '🛢️ Data Engineer' },
    { value: 'data-analyst', label: '📈 Data Analyst' },
    { value: 'devops', label: '☁️ DevOps/Cloud' },
];

const SOURCES = [
    { value: '', label: 'All Sources' },
    { value: 'simplifyjobs', label: '⭐ SimplifyJobs' },
    { value: 'adzuna', label: '🌐 Adzuna' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'indeed', label: 'Indeed' },
    { value: 'greenhouse', label: 'Greenhouse' },
    { value: 'lever', label: 'Lever' },
    { value: 'workday', label: 'Workday' },
    { value: 'direct', label: 'Direct' },
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
        <div className="filter-bar">
            <div className="search-input-wrapper">
                <span className="search-input-icon">🔍</span>
                <input
                    className="search-input"
                    placeholder="Search jobs or companies..."
                    value={search}
                    onChange={e => handleSearch(e.target.value)}
                />
            </div>

            <div className="filter-chips">
                <span className="filter-label">Category:</span>
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

            <div className="filter-chips">
                <span className="filter-label">Source:</span>
                {SOURCES.map(s => (
                    <button
                        key={s.value}
                        className={`chip ${filters.source === s.value ? 'active' : ''}`}
                        onClick={() => onChange({ source: s.value, page: 1 })}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            <button
                className="btn btn-primary"
                onClick={onScrape}
                disabled={scraping}
                style={{ marginLeft: 'auto', flexShrink: 0 }}
            >
                {scraping ? '⏳ Scraping...' : '🚀 Scrape Now'}
            </button>
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
                    {job.location && <span className="job-meta-item">📍 {job.location}</span>}
                    {job.salary && <span className="job-meta-item">💰 {job.salary}</span>}
                    <span className="job-meta-item">📅 Posted {formatDate(job.posted_at || job.scraped_at)}</span>
                    <span className="job-meta-item" style={{ opacity: 0.6 }}>🕐 Scraped {timeAgo(job.scraped_at)}</span>
                </div>
            </div>

            <div className="job-badges">
                {job.is_new === 1 && <span className="badge badge-new">NEW</span>}
                <span className={`badge badge-cat-${job.category}`}>
                    {job.category === 'ai' ? 'AI Eng' :
                        job.category === 'ml' ? 'ML Eng' :
                            job.category === 'fullstack' ? 'Full Stack' :
                                job.category === 'data-science' ? 'Data Science' :
                                    job.category === 'data-engineer' ? 'Data Eng' :
                                        job.category === 'data-analyst' ? 'Data Analyst' :
                                            job.category === 'devops' ? 'DevOps' :
                                                'SWE'}
                </span>
                <span className={`badge badge-${job.source}`}>{job.source}</span>
                {job.status === 'applied' && <span className="badge badge-applied">✓ Applied</span>}
                {job.status === 'saved' && <span className="badge badge-saved">⭐ Saved</span>}
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
                    Apply →
                </a>
                {job.status !== 'saved' && job.status !== 'applied' && (
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onStatusChange(job.id, 'saved')}
                    >
                        ⭐ Save
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

// ── Status Tabs ───────────────────────────────────────────────────────────────

const STATUS_TABS = [
    { value: '', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'saved', label: '⭐ Saved' },
    { value: 'applied', label: '✅ Applied' },
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
            showToast('🚀 Scrape started! Check back in a few minutes.', 'success');
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
                    <div className="navbar-brand-icon">🎯</div>
                    <span>Job<span className="highlight">Hunter</span> Pro</span>
                </a>
                <div className="navbar-actions">
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        Graduating May 2026
                    </span>
                    <a href="/settings" className="btn btn-secondary">
                        ⚙️ Settings
                    </a>
                </div>
            </nav>

            <main className="main-content">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Job Board</h1>
                        <p className="page-subtitle">
                            Aggregating AI, SWE & Data roles from LinkedIn, Indeed, Greenhouse, Lever, Workday & more
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
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
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {total} job{total !== 1 ? 's' : ''} found
                    </div>
                </div>

                {/* Filters */}
                <FilterBar
                    filters={filters}
                    onChange={handleFilterChange}
                    onScrape={handleScrape}
                    scraping={scraping}
                />

                {/* Jobs */}
                {loading ? (
                    <div className="loading-wrapper"><div className="spinner" /></div>
                ) : jobs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🔍</div>
                        <div className="empty-title">No jobs found</div>
                        <div className="empty-desc">
                            {Object.keys(filters).filter(k => filters[k as keyof JobFilters]).length > 2
                                ? 'Try adjusting your filters or click "Scrape Now" to fetch the latest jobs.'
                                : 'Click "🚀 Scrape Now" above to fetch fresh jobs from all sources.'}
                        </div>
                        <button className="btn btn-primary" onClick={handleScrape} disabled={scraping}>
                            {scraping ? '⏳ Scraping...' : '🚀 Scrape Now'}
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
                        {t.type === 'success' ? '✅' : '❌'} {t.msg}
                    </div>
                ))}
            </div>
        </div>
    );
}
