import type { Notebook, Flashcard, StudyMaterial } from '@/types';

const WORKER_BASE_URL = import.meta.env.VITE_BETTER_AUTH_URL || 'https://ai-study-companion-backend.rifa-numis.workers.dev';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('better-auth_token');
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(`${WORKER_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `API Error (${res.status})`;
    try {
      const json = JSON.parse(text);
      if (json.error) msg = json.error;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }

  return res.json();
}

export const api = {
  // Notebooks
  getNotebooks: () => apiFetch<Notebook[]>('/api/notebooks'),
  createNotebook: (title: string) =>
    apiFetch<Notebook>('/api/notebooks', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  updateNotebook: (id: string, patch: { title?: string; pinned?: boolean }) =>
    apiFetch<Notebook>(`/api/notebooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteNotebook: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/notebooks/${id}`, {
      method: 'DELETE',
    }),

  // Study Materials (Cloud DB)
  getMaterials: (notebookId: string) => apiFetch<StudyMaterial[]>(`/api/materials?notebook_id=${notebookId}`),
  createMaterial: (data: { notebook_id: string; type: string; title: string; content: any }) =>
    apiFetch<StudyMaterial>('/api/materials', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateMaterial: (id: string, patch: { title?: string; content?: any }) =>
    apiFetch<StudyMaterial>(`/api/materials/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteMaterial: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/materials/${id}`, {
      method: 'DELETE',
    }),
};
