'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, WatchedCompany, ATSDetectResult } from '@/lib/api';

// ── Clearbit company suggestion type ─────────────────────────────────────────

interface ClearbitSuggestion {
    name: string;
    domain: string;
    logo: string;
}

// ── Push subscription helpers ─────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const { key } = await api.getVapidPublicKey();
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key),
        });
        await api.savePushSubscription(sub.toJSON());
        return sub;
    } catch (err) {
        console.error('Push subscribe failed:', err);
        return null;
    }
}

// ── ATS badge ─────────────────────────────────────────────────────────────────

const ATS_LABELS: Record<string, string> = {
    greenhouse: 'Greenhouse',
    lever: 'Lever',
    ashby: 'Ashby',
    workday: 'Workday',
    smartrecruiters: 'SmartRecruiters',
    workable: 'Workable',
    recruitee: 'Recruitee',
    icims: 'iCIMS',
    taleo: 'Taleo',
    successfactors: 'SuccessFactors',
    custom: 'Custom page',
    unknown: 'Unknown',
};

const ATS_COLORS: Record<string, string> = {
    greenhouse: '#24B47E',
    lever: '#1DA0F2',
    ashby: '#7C3AED',
    workday: '#F7B731',
    smartrecruiters: '#3182CE',
    workable: '#1CAF9A',
    recruitee: '#FF6B6B',
    custom: '#718096',
    unknown: '#718096',
};

function ATSBadge({ type }: { type: string }) {
    const color = ATS_COLORS[type] ?? '#71717a';
    return (
        <span className="badge badge-source" style={{ color, borderColor: `${color}33`, background: `${color}14` }}>
            {ATS_LABELS[type] ?? type}
        </span>
    );
}

// ── Add Company Modal ─────────────────────────────────────────────────────────

function AddCompanyModal({ onAdd, onClose }: { onAdd: () => void; onClose: () => void }) {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<ClearbitSuggestion[]>([]);
    const [selected, setSelected] = useState<ClearbitSuggestion | null>(null);
    const [detecting, setDetecting] = useState(false);
    const [detected, setDetected] = useState<ATSDetectResult | null>(null);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState('');
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Clearbit autocomplete — free, no API key
    useEffect(() => {
        if (query.length < 2) { setSuggestions([]); return; }
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            try {
                const resp = await fetch(
                    `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`
                );
                if (resp.ok) setSuggestions(await resp.json());
            } catch { /* ignore */ }
        }, 300);
        return () => clearTimeout(timerRef.current);
    }, [query]);

    async function handleSelect(s: ClearbitSuggestion) {
        setSelected(s);
        setSuggestions([]);
        setQuery(s.name);
        setDetecting(true);
        setDetected(null);
        try {
            const result = await api.detectATS(s.name, s.domain);
            setDetected(result);
        } catch {
            setDetected({ ats_type: 'unknown', ats_slug: null, career_url: null, supported: false });
        }
        setDetecting(false);
    }

    async function handleAdd() {
        if (!selected) return;
        setAdding(true);
        setError('');
        try {
            await api.addWatchedCompany({
                name: selected.name,
                domain: selected.domain,
                ats_type: detected?.ats_type,
                ats_slug: detected?.ats_slug ?? undefined,
                career_url: detected?.career_url ?? undefined,
            });
            onAdd();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add');
        }
        setAdding(false);
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <span>Watch a Company</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <div className="autocomplete-wrapper">
                        <input
                            className="modal-input"
                            placeholder="Type a company name (e.g. Walmart, Stripe…)"
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelected(null); setDetected(null); }}
                            autoFocus
                        />
                        {suggestions.length > 0 && (
                            <div className="autocomplete-dropdown">
                                {suggestions.slice(0, 6).map(s => (
                                    <div key={s.domain} className="autocomplete-item" onClick={() => handleSelect(s)}>
                                        <img
                                            src={`https://logo.clearbit.com/${s.domain}`}
                                            alt=""
                                            className="autocomplete-logo"
                                            onError={e => (e.currentTarget.style.display = 'none')}
                                        />
                                        <div>
                                            <div className="autocomplete-name">{s.name}</div>
                                            <div className="autocomplete-domain">{s.domain}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {detecting && (
                        <div className="detection-status">
                            <span className="spinner" /> Detecting ATS…
                        </div>
                    )}

                    {detected && selected && (
                        <div className={`detection-result ${detected.supported ? 'supported' : 'unsupported'}`}>
                            <div className="detection-row">
                                <span>ATS detected:</span>
                                <ATSBadge type={detected.ats_type} />
                            </div>
                            {detected.career_url && (
                                <div className="detection-url">{detected.career_url}</div>
                            )}
                            {!detected.supported && detected.ats_type !== 'custom' && (
                                <div className="detection-warn">
                                    ⚠️ This ATS isn&apos;t fully supported yet — basic change detection will be used.
                                </div>
                            )}
                            {detected.ats_type === 'unknown' && (
                                <div className="detection-warn">
                                    ⚠️ Couldn&apos;t find a career page. You can still add and we&apos;ll retry.
                                </div>
                            )}
                        </div>
                    )}

                    {error && <div className="modal-error">{error}</div>}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleAdd}
                        disabled={!selected || adding || detecting}
                    >
                        {adding ? 'Adding…' : '+ Watch Company'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Notification Bell ─────────────────────────────────────────────────────────

export function NotificationBell() {
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
    const [loading, setLoading] = useState(false);
    const [testMsg, setTestMsg] = useState('');

    useEffect(() => {
        if (!('Notification' in window)) { setPermission('unsupported'); return; }
        setPermission(Notification.permission);
    }, []);

    async function handleEnable() {
        setLoading(true);
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm === 'granted') {
            const sub = await subscribeToPush();
            if (!sub) setTestMsg('Failed to subscribe — check browser settings');
        }
        setLoading(false);
    }

    async function handleTest() {
        setLoading(true);
        try {
            const { sent } = await api.testPush();
            setTestMsg(sent > 0 ? '✓ Test sent!' : 'No subscriptions found');
        } catch { setTestMsg('Test failed'); }
        setLoading(false);
        setTimeout(() => setTestMsg(''), 3000);
    }

    if (permission === 'unsupported') return null;

    return (
        <div className="notif-bell-area">
            {permission !== 'granted' ? (
                <button className="btn btn-secondary btn-sm notif-enable-btn" onClick={handleEnable} disabled={loading}>
                    {loading ? '…' : 'Notifications'}
                </button>
            ) : (
                <button className="btn btn-ghost btn-sm" onClick={handleTest} disabled={loading} title="Send test notification">
                    {testMsg || (loading ? '…' : 'Alerts on')}
                </button>
            )}
        </div>
    );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function WatchlistPanel() {
    const [companies, setCompanies] = useState<WatchedCompany[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [open, setOpen] = useState(false); // collapsed by default
    const [importing, setImporting] = useState<string | null>(null);
    const [importMsg, setImportMsg] = useState('');
    const [checking, setChecking] = useState(false);

    // Restore user's last open/close preference from localStorage
    useEffect(() => {
        const stored = localStorage.getItem('watchlist_open');
        if (stored !== null) setOpen(stored === 'true');
    }, []);

    const load = useCallback(async () => {
        try { setCompanies(await api.getWatchedCompanies()); } catch { /* ignore */ }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleRemove(id: string) {
        await api.removeWatchedCompany(id);
        load();
    }

    async function handleCheckNow() {
        setChecking(true);
        setImportMsg('');
        try {
            await api.triggerWatchlist();
            setImportMsg('Checking all watched companies…');
            setTimeout(() => load(), 8000);
            setTimeout(() => setImportMsg(''), 12000);
        } catch {
            setImportMsg('Check failed — is the backend running?');
        }
        setChecking(false);
    }

    async function handlePreset(presetId: string) {
        setImporting(presetId);
        setImportMsg('');
        try {
            const result = await api.bulkImportPreset(presetId);
            setImportMsg(`Added ${result.added} companies (${result.skipped} already watched)`);
            load();
            setTimeout(() => setImportMsg(''), 5000);
        } catch {
            setImportMsg('Import failed — is the backend running?');
        }
        setImporting(null);
    }

    return (
        <div className="watchlist-panel">
            <div
                className="watchlist-header"
                style={{ borderBottom: open ? undefined : 'none' }}
                onClick={() => {
                    setOpen(o => {
                        const next = !o;
                        localStorage.setItem('watchlist_open', String(next));
                        return next;
                    });
                }}
            >
                <div className="watchlist-title">
                    <span>Watchlist</span>
                    {companies.length > 0 && (
                        <span className="watchlist-count">{companies.length}</span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handlePreset('seattle-bellevue-opt')}
                        disabled={importing !== null}
                        title="88 Seattle & Bellevue OPT-friendly companies"
                    >
                        {importing === 'seattle-bellevue-opt' ? '…' : 'Seattle'}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handlePreset('nyc-nj-opt')}
                        disabled={importing !== null}
                        title="65 NYC & NJ OPT-friendly companies"
                    >
                        {importing === 'nyc-nj-opt' ? '…' : 'NYC'}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handlePreset('bay-area-opt')}
                        disabled={importing !== null}
                        title="100 Bay Area OPT-friendly companies"
                    >
                        {importing === 'bay-area-opt' ? '…' : 'Bay Area'}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handlePreset('wdc-discovered')}
                        disabled={importing !== null}
                        title="Companies discovered via Web Data Commons' schema.org job-posting data"
                    >
                        {importing === 'wdc-discovered' ? '…' : 'WDC Discovered'}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleCheckNow}
                        disabled={checking || companies.length === 0}
                        title="Run watchlist check now"
                    >
                        {checking ? '…' : 'Check now'}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={e => { e.stopPropagation(); setShowModal(true); }}
                    >
                        Add company
                    </button>
                    <span className="watchlist-chevron">{open ? '▲' : '▼'}</span>
                </div>
            </div>
            {importMsg && (
                <div className="watchlist-import-msg">{importMsg}</div>
            )}

            {open && (
                <div className="watchlist-body">
                    {companies.length === 0 ? (
                        <div className="watchlist-empty">
                            <div>No companies watched yet.</div>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>
                                Add a company to get notified when they post new roles.
                            </div>
                        </div>
                    ) : (
                        companies.map(c => (
                            <div key={c.id} className={`watchlist-item status-${c.status}`}>
                                <img
                                    src={`https://logo.clearbit.com/${c.domain}`}
                                    alt=""
                                    className="watchlist-logo"
                                    onError={e => {
                                        e.currentTarget.style.display = 'none';
                                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }}
                                />
                                <div className="watchlist-logo-fallback" style={{ display: 'none' }}>
                                    {c.name.slice(0, 2).toUpperCase()}
                                </div>

                                <div className="watchlist-info">
                                    <div className="watchlist-name">{c.name}</div>
                                    <div className="watchlist-meta">
                                        <ATSBadge type={c.ats_type} />
                                        {c.active_jobs_count > 0 && (
                                            <span className="watchlist-jobs">{c.active_jobs_count} matching</span>
                                        )}
                                        {c.notify_count > 0 && (
                                            <span className="watchlist-notifs">{c.notify_count} alerts</span>
                                        )}
                                    </div>
                                    {c.last_checked && (
                                        <div className="watchlist-last-checked">
                                            Last checked {timeAgo(c.last_checked)}
                                        </div>
                                    )}
                                    {c.status === 'error' && c.error_msg && (
                                        <div className="watchlist-error">{c.error_msg}</div>
                                    )}
                                </div>

                                <div className="watchlist-actions">
                                    {c.career_url && (
                                        <a href={c.career_url} target="_blank" rel="noopener noreferrer"
                                            className="btn btn-ghost btn-sm" title="Open career page">
                                            ↗
                                        </a>
                                    )}
                                    <button
                                        className="btn btn-ghost btn-sm watchlist-remove"
                                        onClick={() => handleRemove(c.id)}
                                        title="Remove"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {showModal && (
                <AddCompanyModal
                    onAdd={load}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}

function timeAgo(dateStr: string) {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 60000) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
