import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildTaskRows, getSubtreeIds, isAncestor } from './tree';

function task(id: string, parentId: string | null): Task {
  return {
    id,
    name: `Tugas ${id}`,
    parentId,
    startDate: '2026-10-12',
    duration: 2,
    priority: 'Medium',
    color: '#3b82f6',
    assigneeIds: [],
    optimistic: 2,
    pessimistic: 2,
  };
}

// t1 & t4 top-level; t2, t3 anak t1; t5, t6 anak t4.
const TASKS: Task[] = [
  task('t1', null),
  task('t2', 't1'),
  task('t3', 't1'),
  task('t4', null),
  task('t5', 't4'),
  task('t6', 't4'),
];

describe('buildTaskRows', () => {
  it('menampilkan seluruh hierarki bila tidak ada yang ditutup', () => {
    const rows = buildTaskRows(TASKS, new Set());
    expect(rows.map((r) => r.task.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0, 1, 1]);
  });

  // Regresi: sub-tugas yang disembunyikan collapse sempat ikut ditambahkan
  // kembali oleh loop fallback, sehingga tombol "Tutup Semua" tidak berpengaruh.
  it('menyembunyikan sub-tugas induk yang ditutup', () => {
    const rows = buildTaskRows(TASKS, new Set(['t1']));
    expect(rows.map((r) => r.task.id)).toEqual(['t1', 't4', 't5', 't6']);
  });

  it('menyembunyikan sub-tugas ketika semua induk ditutup', () => {
    const rows = buildTaskRows(TASKS, new Set(['t1', 't4']));
    expect(rows.map((r) => r.task.id)).toEqual(['t1', 't4']);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it('menandai status collapsed pada induk, bukan pada anak', () => {
    const rows = buildTaskRows(TASKS, new Set(['t1']));
    const byId = new Map(rows.map((r) => [r.task.id, r]));
    expect(byId.get('t1')?.collapsed).toBe(true);
    expect(byId.get('t1')?.hasChildren).toBe(true);
    expect(byId.get('t4')?.collapsed).toBe(false);
  });

  it('tetap menampilkan tugas yatim (parent-nya tak ada) sebagai top-level', () => {
    const orphan = [...TASKS, task('t7', 'hilang')];
    const rows = buildTaskRows(orphan, new Set(['t1']));
    expect(rows.map((r) => r.task.id)).toContain('t7');
    expect(rows.find((r) => r.task.id === 't7')?.depth).toBe(0);
  });

  it('tidak terjebak siklus parent-child', () => {
    const cyclic = [task('a', 'b'), task('b', 'a'), task('c', null)];
    const rows = buildTaskRows(cyclic, new Set());
    expect(new Set(rows.map((r) => r.task.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('fallback siklus tidak mengembalikan anak yang sengaja disembunyikan', () => {
    const cyclic = [task('a', 'b'), task('b', 'a'), task('c', null), task('d', 'c')];
    const rows = buildTaskRows(cyclic, new Set(['c']));
    expect(rows.map((r) => r.task.id)).not.toContain('d');
  });
});

describe('util hierarki lain', () => {
  it('getSubtreeIds mengumpulkan seluruh keturunan', () => {
    expect([...getSubtreeIds(TASKS, 't1')].sort()).toEqual(['t1', 't2', 't3']);
    expect([...getSubtreeIds(TASKS, 't4')].sort()).toEqual(['t4', 't5', 't6']);
  });

  it('isAncestor mengenali leluhur', () => {
    expect(isAncestor(TASKS, 't1', 't2')).toBe(true);
    expect(isAncestor(TASKS, 't1', 't4')).toBe(false);
    expect(isAncestor(TASKS, 't2', 't1')).toBe(false);
  });
});
