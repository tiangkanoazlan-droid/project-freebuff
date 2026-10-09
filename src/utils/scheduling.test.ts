import { describe, expect, it } from 'vitest';
import type { CalendarConfig, Dependency, ProjectState, Task } from '../types';
import { computeSchedule, pertEstimate, topologicalOrder } from './scheduling';

// Referensi: 2026-10-09 = Jumat, 2026-10-12 = Senin, 2026-10-17/18 = akhir pekan.
const calendar: CalendarConfig = { weekendDays: [0, 6], holidays: [] };

function makeTask(id: string, startDate: string, duration: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    name: `Tugas ${id}`,
    parentId: null,
    startDate,
    duration,
    priority: 'Medium',
    color: '#000000',
    assigneeIds: [],
    optimistic: duration,
    pessimistic: duration,
    ...extra,
  };
}

function makeState(tasks: Task[], dependencies: Dependency[] = []): ProjectState {
  return {
    projectName: 'Proyek Tes',
    startDate: '2026-10-12',
    tasks,
    dependencies,
    members: [],
    calendar,
  };
}

function dep(
  predecessorId: string,
  successorId: string,
  type: 'FS' | 'SS',
  lag: number,
  id: string,
): Dependency {
  return { id, predecessorId, successorId, type, lag };
}

describe('penjadwalan CPM', () => {
  it('menjalankan rantai Finish-to-Start dengan benar', () => {
    const state = makeState(
      [makeTask('a', '2026-10-12', 3), makeTask('b', '2026-10-12', 2)],
      [dep('a', 'b', 'FS', 0, 'd1')],
    );
    const schedule = computeSchedule(state);

    expect(schedule.entries.a.startDate).toBe('2026-10-12');
    expect(schedule.entries.a.endDate).toBe('2026-10-14'); // Sen, Sel, Rab
    expect(schedule.entries.b.startDate).toBe('2026-10-15'); // hari kerja setelah a selesai
    expect(schedule.entries.b.endDate).toBe('2026-10-16');
    expect(schedule.entries.a.critical).toBe(true);
    expect(schedule.entries.b.critical).toBe(true);
    expect(schedule.entries.b.slack).toBe(0);
    expect(schedule.projectDuration).toBe(5);
  });

  it('menghitung Start-to-Start dengan lag hari kerja', () => {
    const state = makeState(
      [makeTask('a', '2026-10-12', 3), makeTask('b', '2026-10-12', 2)],
      [dep('a', 'b', 'SS', 1, 'd1')],
    );
    const schedule = computeSchedule(state);
    expect(schedule.entries.b.startDate).toBe('2026-10-13'); // SS + 1 hari kerja
  });

  it('menambahkan lag pada FS dalam hari kerja', () => {
    const state = makeState(
      [makeTask('a', '2026-10-12', 3), makeTask('b', '2026-10-12', 2)],
      [dep('a', 'b', 'FS', 2, 'd1')],
    );
    const schedule = computeSchedule(state);
    // a selesai 14 Okt, +1 kerja = 15 Okt, +2 lag = 19 Okt (lewati akhir pekan).
    expect(schedule.entries.b.startDate).toBe('2026-10-19');
  });

  it('menghitung slack dan jalur kritis', () => {
    const state = makeState(
      [
        makeTask('a', '2026-10-12', 3),
        makeTask('b', '2026-10-15', 2),
        makeTask('c', '2026-10-19', 1),
        makeTask('z', '2026-10-12', 4),
      ],
      [dep('a', 'b', 'FS', 0, 'd1'), dep('b', 'c', 'FS', 0, 'd2')],
    );
    const schedule = computeSchedule(state);

    expect(schedule.projectEnd).toBe('2026-10-19');
    expect(schedule.projectDuration).toBe(6);
    expect(schedule.entries.a.critical).toBe(true);
    expect(schedule.entries.b.critical).toBe(true);
    expect(schedule.entries.c.critical).toBe(true);
    expect(schedule.entries.z.critical).toBe(false);
    expect(schedule.entries.z.slack).toBe(2);
  });

  it('menghormati hari libur dalam penjadwalan', () => {
    const state = makeState([makeTask('a', '2026-10-15', 2)]);
    const withHoliday: ProjectState = {
      ...state,
      calendar: {
        weekendDays: [0, 6],
        holidays: [{ id: 'h1', date: '2026-10-16', name: 'Libur' }],
      },
    };
    const schedule = computeSchedule(withHoliday);
    expect(schedule.entries.a.startDate).toBe('2026-10-15');
    expect(schedule.entries.a.endDate).toBe('2026-10-19'); // 16 Okt libur
  });

  it('tetap selesai meskipun ada siklus dependensi', () => {
    const state = makeState(
      [makeTask('a', '2026-10-12', 2), makeTask('b', '2026-10-12', 2)],
      [dep('a', 'b', 'FS', 0, 'd1'), dep('b', 'a', 'FS', 0, 'd2')],
    );
    const order = topologicalOrder(state.tasks, state.dependencies);
    expect(order).toHaveLength(2);
    expect(new Set(order)).toEqual(new Set(['a', 'b']));

    const schedule = computeSchedule(state);
    expect(Object.keys(schedule.entries)).toHaveLength(2);
  });

  it('mendukung durasi override (dipakai analisis PERT)', () => {
    const state = makeState([makeTask('a', '2026-10-12', 4)]);
    const schedule = computeSchedule(state, (task) => task.duration + 1);
    expect(schedule.entries.a.endDate).toBe('2026-10-16'); // 5 hari kerja: 12..16
  });
});

describe('estimasi PERT', () => {
  it('menghitung E = (O + 4M + P) / 6 dan varian', () => {
    const task = makeTask('x', '2026-10-12', 4, { optimistic: 2, pessimistic: 8 });
    const estimate = pertEstimate(task);
    expect(estimate.expected).toBeCloseTo((2 + 4 * 4 + 8) / 6, 5);
    expect(estimate.variance).toBeCloseTo(Math.pow((8 - 2) / 6, 2), 5);
  });

  it('meng-clamp O dan P agar O <= M <= P', () => {
    const task = makeTask('x', '2026-10-12', 5, { optimistic: 9, pessimistic: 2 });
    const estimate = pertEstimate(task);
    expect(estimate.optimistic).toBe(5);
    expect(estimate.pessimistic).toBe(5);
    expect(estimate.expected).toBe(5);
    expect(estimate.variance).toBe(0);
  });
});
