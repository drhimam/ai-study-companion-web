import type { Notebook, Flashcard, StudyMaterial } from '@/types';

const WORKER_BASE_URL = import.meta.env.VITE_BETTER_AUTH_URL || 'https://ai-study-companion-backend.rifa-numis.workers.dev';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WORKER_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
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
};
