'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function SettingsPage() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.getSettings().then(s => { setSettings(s); setLoading(false); });
    }, []);

    function update(key: string, value: string) {
        setSettings(prev => ({ ...prev, [key]: value }));
    }

    async function handleSave() {
        setSaving(true);
        try {
            await api.saveSettings(settings);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } finally {
            setSaving(false);
        }
    }

    const seniorFilterOn = settings.filter_exclude_senior !== 'false';

    return (
        <div className="app-layout">
            <nav className="navbar">
                <div className="grid-container navbar-inner">
                    <a href="/" className="navbar-brand">
                        <span className="navbar-brand-mark" aria-hidden />
                        Job Hunter
                    </a>
                    <div className="navbar-actions">
                        <a href="/" className="btn btn-ghost btn-sm">← Jobs</a>
                    </div>
                </div>
            </nav>

            <main className="main-content grid-container">
                <div className="page-header">
                    <div>
                        <p className="page-meta">Configuration</p>
                        <h1 className="page-title">Settings</h1>
                        <p className="page-subtitle">Keywords, filters, and scrape preferences.</p>
                    </div>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
                    </button>
                </div>

                {loading ? (
                    <div className="loading-wrapper">
                        <div className="spinner" />
                        <span>Loading settings…</span>
                    </div>
                ) : (
                    <div className="settings-container">
                        <div className="settings-section">
                            <div className="settings-section-title">Display</div>

                            <div className="settings-field">
                                <label className="settings-label">Navbar label</label>
                                <input
                                    type="text"
                                    className="settings-input"
                                    value={settings.grad_label || ''}
                                    onChange={e => update('grad_label', e.target.value)}
                                    placeholder="2026 new grad"
                                />
                                <p className="settings-help">
                                    Shown in the top-right of the navbar. Update this after graduation (e.g. &quot;New grad SWE&quot; or &quot;1 YOE&quot;).
                                </p>
                            </div>
                        </div>

                        <div className="settings-section">
                            <div className="settings-section-title">Search keywords</div>

                            <div className="settings-field">
                                <label className="settings-label">AI / ML</label>
                                <textarea
                                    className="settings-input settings-textarea"
                                    value={settings.keywords_ai || ''}
                                    onChange={e => update('keywords_ai', e.target.value)}
                                    placeholder="new grad AI engineer, entry level machine learning…"
                                />
                                <p className="settings-help">Comma-separated. Used by optional JSearch queries.</p>
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">Software engineering</label>
                                <textarea
                                    className="settings-input settings-textarea"
                                    value={settings.keywords_swe || ''}
                                    onChange={e => update('keywords_swe', e.target.value)}
                                />
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">Data</label>
                                <textarea
                                    className="settings-input settings-textarea"
                                    value={settings.keywords_data || ''}
                                    onChange={e => update('keywords_data', e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="settings-section">
                            <div className="settings-section-title">Filters</div>
                            <div className="settings-toggle-row">
                                <div>
                                    <div className="settings-label" style={{ marginBottom: 4 }}>Exclude senior roles</div>
                                    <p className="settings-help" style={{ marginTop: 0 }}>
                                        Hides Senior, Staff, Principal, Lead, and Manager titles.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className={`chip ${seniorFilterOn ? 'active' : ''}`}
                                    onClick={() => update('filter_exclude_senior', seniorFilterOn ? 'false' : 'true')}
                                >
                                    {seniorFilterOn ? 'On' : 'Off'}
                                </button>
                            </div>
                        </div>

                        <div className="settings-section">
                            <div className="settings-section-title">About</div>
                            <div className="settings-about-grid">
                                <div>
                                    <strong>Sources</strong>
                                    <ul>
                                        <li>Greenhouse, Lever, Ashby, Workday</li>
                                        <li>SimplifyJobs community feed</li>
                                        <li>RemoteOK, Remotive, Himalayas, WWR</li>
                                        <li>Adzuna & JSearch (optional keys)</li>
                                    </ul>
                                </div>
                                <div>
                                    <strong>Features</strong>
                                    <ul>
                                        <li>Company watchlist + push alerts</li>
                                        <li>250+ OPT-friendly presets</li>
                                        <li>ATS auto-detection</li>
                                        <li>Application tracking</li>
                                        <li>Supabase Postgres storage</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
