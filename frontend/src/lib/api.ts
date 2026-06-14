// In production: set NEXT_PUBLIC_API_URL in Vercel env vars to your Railway backend URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface Job {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    source: string;
    category: 'swe' | 'frontend' | 'backend' | 'fullstack' | 'ai' | 'ml' | 'data-science' | 'data-engineer' | 'data-analyst' | 'devops';
    salary: string | null;
    description: string | null;
    notes: string | null;
    posted_at: string;
    previous_posted_at: string | null;
    reposted_at: string | null;
    scraped_at: string;
    applied_at: string | null;
    status: 'new' | 'saved' | 'applied' | 'ignored';
    is_new: number;
    is_reposted: number;
    is_fresh: number;
}

export interface JobsResponse {
    jobs: Job[];
    total: number;
    page: number;
    limit: number;
}

export interface Stats {
    total: number;
    new_count: number;
    count_new: number;
    applied: number;
    saved: number;
    ignored: number;
    last_24h: number;
    last_run: {
        id: number;
        started_at: string;
        finished_at: string;
        jobs_found: number;
        jobs_new: number;
        errors: string | null;
    } | null;
}

export interface JobFilters {
    status?: string;
    category?: string;
    role?: string;
    source?: string;
    search?: string;
    fresh_only?: string;
    has_salary?: string;
    max_age_days?: string;
    experience?: string;
    us_only?: string;
    page?: number;
    limit?: number;
}

export interface WatchedCompany {
    id: string;
    name: string;
    domain: string | null;
    career_url: string | null;
    ats_type: string;
    ats_slug: string | null;
    watch_roles: string; // JSON string
    last_checked: string | null;
    active_jobs_count: number;
    notify_count: number;
    status: 'active' | 'paused' | 'error';
    error_msg: string | null;
    created_at: string;
}

export interface ATSDetectResult {
    ats_type: string;
    ats_slug: string | null;
    career_url: string | null;
    supported: boolean;
}

export interface WatchNotification {
    id: number;
    company_id: string;
    company_name: string;
    job_title: string;
    job_url: string;
    sent_at: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
    }
    return res.json();
}

export const api = {
    getJobs: (filters: JobFilters = {}) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
        });
        if (!params.has('us_only')) params.set('us_only', '1');
        return apiFetch<JobsResponse>(`/jobs?${params}`);
    },

    updateJobStatus: (id: string, status: string) =>
        apiFetch<{ ok: boolean }>(`/jobs/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        }),

    updateJobNotes: (id: string, notes: string | null) =>
        apiFetch<{ ok: boolean }>(`/jobs/${id}/notes`, {
            method: 'PATCH',
            body: JSON.stringify({ notes }),
        }),

    markAllSeen: () =>
        apiFetch<{ ok: boolean }>('/jobs/mark-seen', { method: 'POST' }),

    getStats: () => apiFetch<Stats>('/stats'),

    triggerScrape: () =>
        apiFetch<{ ok: boolean; message: string }>('/scrape/run', { method: 'POST' }),

    getSettings: () => apiFetch<Record<string, string>>('/settings'),

    saveSettings: (settings: Record<string, string>) =>
        apiFetch<{ ok: boolean; settings: Record<string, string> }>('/settings', {
            method: 'POST',
            body: JSON.stringify(settings),
        }),

    // Watched companies
    getWatchedCompanies: () => apiFetch<WatchedCompany[]>('/companies'),

    detectATS: (name: string, domain?: string) =>
        apiFetch<ATSDetectResult>('/companies/detect', {
            method: 'POST',
            body: JSON.stringify({ name, domain }),
        }),

    addWatchedCompany: (data: { name: string; domain?: string; ats_type?: string; ats_slug?: string; career_url?: string; watch_roles?: string[] }) =>
        apiFetch<{ ok: boolean; company: WatchedCompany }>('/companies', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    removeWatchedCompany: (id: string) =>
        apiFetch<{ ok: boolean }>(`/companies/${id}`, { method: 'DELETE' }),

    // Push notifications
    getVapidPublicKey: () => apiFetch<{ key: string }>('/push/vapid-public-key'),

    savePushSubscription: (sub: PushSubscriptionJSON) =>
        apiFetch<{ ok: boolean }>('/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(sub),
        }),

    removePushSubscription: (endpoint: string) =>
        apiFetch<{ ok: boolean }>('/push/unsubscribe', {
            method: 'DELETE',
            body: JSON.stringify({ endpoint }),
        }),

    testPush: () => apiFetch<{ ok: boolean; sent: number }>('/push/test', { method: 'POST' }),

    getNotifications: () => apiFetch<WatchNotification[]>('/notifications'),

    // Presets
    getPresets: () => apiFetch<{ id: string; label: string; description: string; count: number }[]>('/companies/presets'),

    bulkImportPreset: (preset_id: string) =>
        apiFetch<{ ok: boolean; added: number; skipped: number; total: number }>('/companies/bulk', {
            method: 'POST',
            body: JSON.stringify({ preset_id }),
        }),

    triggerWatchlist: () =>
        apiFetch<{ ok: boolean; message: string }>('/companies/watch/run', { method: 'POST' }),
};
