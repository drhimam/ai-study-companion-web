import type { Message } from '@/types';

const PREFIX = 'ai_companion_messages_';

function key(notebookId: string): string {
  return `${PREFIX}${notebookId}`;
}

export function loadLocalMessages(notebookId: string): Message[] {
  try {
    const raw = localStorage.getItem(key(notebookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalMessages(notebookId: string, messages: Message[]): void {
  try {
    localStorage.setItem(key(notebookId), JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save messages locally', e);
    throw new Error('Browser storage is full or unavailable.');
  }
}

export function appendLocalMessage(notebookId: string, message: Message): void {
  const msgs = loadLocalMessages(notebookId);
  msgs.push(message);
  saveLocalMessages(notebookId, msgs);
}

export function deleteLocalMessage(notebookId: string, messageId: string): void {
  const msgs = loadLocalMessages(notebookId).filter((m) => m.id !== messageId);
  saveLocalMessages(notebookId, msgs);
}

export function clearLocalMessages(notebookId: string): void {
  localStorage.removeItem(key(notebookId));
}

export function getAllLocalMessageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}

export interface ExportEntry {
  notebook_id: string;
  messages: Message[];
}

export interface ExportBundle {
  version: 1;
  exported_at: string;
  notebooks: ExportEntry[];
}

export function exportAllLocalMessages(): ExportBundle {
  const keys = getAllLocalMessageKeys();
  const notebooks: ExportEntry[] = keys.map((k) => {
    const notebookId = k.slice(PREFIX.length);
    return { notebook_id: notebookId, messages: loadLocalMessages(notebookId) };
  });
  return { version: 1, exported_at: new Date().toISOString(), notebooks };
}

export function importLocalMessages(bundle: ExportBundle, mode: 'merge' | 'replace' = 'merge'): { imported: number; notebooks: number } {
  if (!bundle || !Array.isArray(bundle.notebooks)) {
    throw new Error('Invalid backup file: missing notebooks array.');
  }
  let imported = 0;
  let notebooks = 0;
  for (const entry of bundle.notebooks) {
    if (!entry.notebook_id || !Array.isArray(entry.messages)) continue;
    notebooks++;
    if (mode === 'replace') {
      saveLocalMessages(entry.notebook_id, entry.messages);
      imported += entry.messages.length;
    } else {
      const existing = loadLocalMessages(entry.notebook_id);
      const existingIds = new Set(existing.map((m) => m.id));
      const newMsgs = entry.messages.filter((m) => !existingIds.has(m.id));
      saveLocalMessages(entry.notebook_id, [...existing, ...newMsgs]);
      imported += newMsgs.length;
    }
  }
  return { imported, notebooks };
}
