import type { StudyMaterial } from '@/types';

const PREFIX = 'ai_companion_materials_';

function key(notebookId: string): string {
  return `${PREFIX}${notebookId}`;
}

export function loadLocalMaterials(notebookId: string): StudyMaterial[] {
  try {
    const raw = localStorage.getItem(key(notebookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalMaterials(notebookId: string, materials: StudyMaterial[]): void {
  try {
    localStorage.setItem(key(notebookId), JSON.stringify(materials));
  } catch (e) {
    console.error('Failed to save materials locally', e);
  }
}

export function clearLocalMaterials(notebookId: string): void {
  localStorage.removeItem(key(notebookId));
}
