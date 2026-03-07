// In production: set NEXT_PUBLIC_API_URL in Vercel env vars to your Railway backend URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface Job {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    source: string;
    category: 'ai' | 'swe' | 'data';
    salary: string | null;
    description: string | null;
    posted_at: string;
    scraped_at: string;
    status: 'new' | 'saved' | 'applied' | 'ignored';
    is_new: number;
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
    applied: number;
    saved: number;
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
    source?: string;
    search?: string;
    page?: number;
    limit?: number;
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
        return apiFetch<JobsResponse>(`/jobs?${params}`);
    },

    updateJobStatus: (id: string, status: string) =>
        apiFetch<{ ok: boolean }>(`/jobs/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
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
};
