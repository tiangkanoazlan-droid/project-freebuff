import type { ProjectState } from '../types';
import { createSeedState } from '../data/seed';
import { isProjectState } from './projectReducer';

export const STORAGE_KEY = 'manajemen-proyek-gantt:v1';

export function loadProjectState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed: unknown = JSON.parse(raw);
    if (!isProjectState(parsed)) return createSeedState();
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function saveProjectState(state: ProjectState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Kuota penuh / mode privat: abaikan, data tetap hidup di memori.
  }
}
