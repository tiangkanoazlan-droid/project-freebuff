import { describe, expect, it } from 'vitest';
import type { ProjectState, Task } from '../types';
import { projectReducer } from './projectReducer';

function baseState(): ProjectState {
  return {
    projectName: 'Proyek Tes',
    startDate: '2026-10-12',
    members: [{ id: 'm1', name: 'Andi', email: 'andi@contoh.id', role: 'Dev', salary: 10_000_000 }],
    tasks: [],
    dependencies: [],
    calendar: { weekendDays: [0, 6], holidays: [] },
  };
}

function makeTask(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    name: `Tugas ${id}`,
    parentId: null,
    startDate: '2026-10-12',
    duration: 3,
    priority: 'Medium',
    color: '#3b82f6',
    assigneeIds: [],
    optimistic: 3,
    pessimistic: 3,
    ...extra,
  };
}

describe('reducer tugas', () => {
  it('ADD_TASK menambahkan tugas dan menggeser tanggal mulai ke hari kerja', () => {
    const next = projectReducer(
      baseState(),
      { type: 'ADD_TASK', task: makeTask('a', { startDate: '2026-10-10' }) },
    );
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].id).toBe('a');
    expect(next.tasks[0].startDate).toBe('2026-10-12'); // Sabtu -> Senin
  });

  it('ADD_TASK membuang alokasi anggota yang tidak terdaftar', () => {
    const next = projectReducer(
      baseState(),
      { type: 'ADD_TASK', task: makeTask('a', { assigneeIds: ['m1', 'ghost'] }) },
    );
    expect(next.tasks[0].assigneeIds).toEqual(['m1']);
  });

  it('DELETE_TASK menCascade sub-tugas dan dependensinya', () => {
    const state: ProjectState = {
      ...baseState(),
      tasks: [makeTask('p'), makeTask('c', { parentId: 'p' }), makeTask('x')],
      dependencies: [
        { id: 'd1', predecessorId: 'p', successorId: 'x', type: 'FS', lag: 0 },
        { id: 'd2', predecessorId: 'c', successorId: 'x', type: 'SS', lag: 1 },
      ],
    };
    const next = projectReducer(state, { type: 'DELETE_TASK', id: 'p' });
    expect(next.tasks.map((t) => t.id)).toEqual(['x']);
    expect(next.dependencies).toHaveLength(0);
  });

  it('UPDATE_TASK menolak parent yang membuat siklus hierarki', () => {
    const state: ProjectState = {
      ...baseState(),
      tasks: [makeTask('a'), makeTask('b', { parentId: 'a' })],
    };
    const next = projectReducer(state, { type: 'UPDATE_TASK', id: 'a', patch: { parentId: 'b' } });
    expect(next.tasks.find((t) => t.id === 'a')?.parentId).toBeNull();
  });

  it('UPDATE_TASK menerapkan perubahan normal', () => {
    const state: ProjectState = { ...baseState(), tasks: [makeTask('a')] };
    const next = projectReducer(state, {
      type: 'UPDATE_TASK',
      id: 'a',
      patch: { duration: 7, priority: 'High', color: '#ef4444' },
    });
    expect(next.tasks[0].duration).toBe(7);
    expect(next.tasks[0].priority).toBe('High');
    expect(next.tasks[0].color).toBe('#ef4444');
  });
});

describe('reducer dependensi', () => {
  const withDeps = (): ProjectState => ({
    ...baseState(),
    tasks: [makeTask('a'), makeTask('b')],
    dependencies: [{ id: 'd1', predecessorId: 'a', successorId: 'b', type: 'FS', lag: 2 }],
  });

  it('ADD_DEPENDENCY menolak yang membuat siklus', () => {
    const next = projectReducer(withDeps(), {
      type: 'ADD_DEPENDENCY',
      dependency: { predecessorId: 'b', successorId: 'a', type: 'FS', lag: 0 },
    });
    expect(next.dependencies).toHaveLength(1);
  });

  it('ADD_DEPENDENCY menolak duplikat dan self-loop', () => {
    const state = withDeps();
    const duplicate = projectReducer(state, {
      type: 'ADD_DEPENDENCY',
      dependency: { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
    });
    expect(duplicate.dependencies).toHaveLength(1);

    const selfLoop = projectReducer(state, {
      type: 'ADD_DEPENDENCY',
      dependency: { predecessorId: 'a', successorId: 'a', type: 'FS', lag: 0 },
    });
    expect(selfLoop.dependencies).toHaveLength(1);
  });

  it('UPDATE_DEPENDENCY meng-clamp lag negatif ke 0', () => {
    const next = projectReducer(withDeps(), {
      type: 'UPDATE_DEPENDENCY',
      id: 'd1',
      patch: { lag: -5 },
    });
    expect(next.dependencies[0].lag).toBe(0);
  });

  it('DELETE_DEPENDENCY menghapus dependensi', () => {
    const next = projectReducer(withDeps(), { type: 'DELETE_DEPENDENCY', id: 'd1' });
    expect(next.dependencies).toHaveLength(0);
  });
});

describe('reducer anggota, kalender, dan proyek', () => {
  it('DELETE_MEMBER melepas alokasi dari seluruh tugas', () => {
    const state: ProjectState = {
      ...baseState(),
      tasks: [makeTask('a', { assigneeIds: ['m1'] })],
    };
    const next = projectReducer(state, { type: 'DELETE_MEMBER', id: 'm1' });
    expect(next.members).toHaveLength(0);
    expect(next.tasks[0].assigneeIds).toEqual([]);
  });

  it('SET_WEEKEND_DAYS menyaring nilai di luar 0-6 dan duplikat', () => {
    const initial: ProjectState = {
      ...baseState(),
      calendar: { weekendDays: [5, 6], holidays: [] },
    };
    const next = projectReducer(initial, { type: 'SET_WEEKEND_DAYS', days: [6, 0, 0, 9] });
    expect(next.calendar.weekendDays).toEqual([0, 6]);
  });

  it('ADD_HOLIDAY menolak tanggal ganda', () => {
    let state = projectReducer(baseState(), {
      type: 'ADD_HOLIDAY',
      holiday: { id: 'h1', date: '2026-12-25', name: 'Natal' },
    });
    expect(state.calendar.holidays).toHaveLength(1);

    state = projectReducer(state, {
      type: 'ADD_HOLIDAY',
      holiday: { id: 'h2', date: '2026-12-25', name: 'Natal Lagi' },
    });
    expect(state.calendar.holidays).toHaveLength(1);
  });

  it('REMOVE_HOLIDAY menghapus hari libur', () => {
    let state = projectReducer(baseState(), {
      type: 'ADD_HOLIDAY',
      holiday: { id: 'h1', date: '2026-12-25', name: 'Natal' },
    });
    state = projectReducer(state, { type: 'REMOVE_HOLIDAY', id: 'h1' });
    expect(state.calendar.holidays).toHaveLength(0);
  });

  it('SET_PROJECT_NAME mengabaikan nama kosong', () => {
    const state = projectReducer(baseState(), { type: 'SET_PROJECT_NAME', name: '  ' });
    expect(state.projectName).toBe('Proyek Tes');
  });

  it('RESET_SEED mengembalikan data contoh', () => {
    const state = projectReducer(
      { ...baseState(), tasks: [makeTask('a')] },
      { type: 'RESET_SEED' },
    );
    expect(state.tasks.length).toBeGreaterThan(5);
    expect(state.members.length).toBeGreaterThan(0);
    expect(state.dependencies.length).toBeGreaterThan(0);
  });
});
