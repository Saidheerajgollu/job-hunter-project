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

    return (
        <div className="app-layout">
            <nav className="navbar">
                <a href="/" className="navbar-brand">
                    <div className="navbar-brand-icon">🎯</div>
                    <span>Job<span className="highlight">Hunter</span> Pro</span>
                </a>
                <div className="navbar-actions">
                    <a href="/" className="btn btn-secondary">← Dashboard</a>
                </div>
            </nav>

            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">⚙️ Settings</h1>
                        <p className="page-subtitle">Configure your job search keywords and preferences</p>
                    </div>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : saved ? '✅ Saved!' : '💾 Save Settings'}
                    </button>
                </div>

                {loading ? (
                    <div className="loading-wrapper"><div className="spinner" /></div>
                ) : (
                    <div className="settings-container">
                        {/* Keywords */}
                        <div className="settings-section">
                            <div className="settings-section-title">🔍 Search Keywords</div>

                            <div className="settings-field">
                                <label className="settings-label">🤖 AI / ML Keywords (comma-separated)</label>
                                <textarea
                                    className="settings-input settings-textarea"
                                    value={settings.keywords_ai || ''}
                                    onChange={e => update('keywords_ai', e.target.value)}
                                />
                                <p className="settings-help">
                                    e.g. new grad AI engineer, entry level machine learning, junior LLM engineer
                                </p>
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">💻 SWE Keywords</label>
                                <textarea
                                    className="settings-input settings-textarea"
                                    value={settings.keywords_swe || ''}
                                    onChange={e => update('keywords_swe', e.target.value)}
                                />
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">📊 Data Keywords</label>
                                <textarea
                                    className="settings-input settings-textarea"
                                    value={settings.keywords_data || ''}
                                    onChange={e => update('keywords_data', e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Schedule */}
                        <div className="settings-section">
                            <div className="settings-section-title">⏰ Scrape Schedule</div>
                            <div className="settings-field">
                                <label className="settings-label">Scrape Interval (hours)</label>
                                <input
                                    type="number"
                                    className="settings-input"
                                    style={{ maxWidth: '120px' }}
                                    min={1}
                                    max={24}
                                    value={settings.scrape_interval_hours || '4'}
                                    onChange={e => update('scrape_interval_hours', e.target.value)}
                                />
                                <p className="settings-help">
                                    Default: 4 hours. Restart the backend server after changing this.
                                </p>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="settings-section">
                            <div className="settings-section-title">🎯 Job Filters</div>
                            <div className="settings-field" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <label className="settings-label" style={{ margin: 0 }}>
                                    Auto-filter senior / staff / principal roles
                                </label>
                                <button
                                    className={`chip ${settings.filter_exclude_senior !== 'false' ? 'active' : ''}`}
                                    onClick={() => update('filter_exclude_senior', settings.filter_exclude_senior === 'false' ? 'true' : 'false')}
                                >
                                    {settings.filter_exclude_senior !== 'false' ? '✅ ON' : '❌ OFF'}
                                </button>
                            </div>
                            <p className="settings-help" style={{ marginTop: '8px' }}>
                                When ON, jobs with titles containing "Senior", "Staff", "Principal", "Lead", "Manager", etc. are excluded.
                            </p>
                        </div>

                        {/* About */}
                        <div className="settings-section">
                            <div className="settings-section-title">ℹ️ About</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                <div>
                                    <strong style={{ color: 'var(--text-primary)' }}>Sources scraped:</strong>
                                    <ul style={{ marginTop: '8px', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <li>LinkedIn Jobs</li>
                                        <li>Indeed</li>
                                        <li>Greenhouse (30+ companies)</li>
                                        <li>Lever (30+ companies)</li>
                                        <li>Workday (FAANG + more)</li>
                                        <li>Direct career pages</li>
                                    </ul>
                                </div>
                                <div>
                                    <strong style={{ color: 'var(--text-primary)' }}>Companies targeted:</strong>
                                    <ul style={{ marginTop: '8px', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <li>OpenAI, Anthropic, Cohere</li>
                                        <li>Google, Meta, Apple, Microsoft</li>
                                        <li>Databricks, Snowflake, Hugging Face</li>
                                        <li>Stripe, Figma, Notion, Airbnb</li>
                                        <li>Cloudflare, Datadog, Palantir</li>
                                        <li>+ 50 more automatically</li>
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
