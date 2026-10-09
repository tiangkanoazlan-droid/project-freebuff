import type { CalendarConfig, Dependency, ProjectState, Task } from '../types';
import { dateFromWorkIndex, workIndex } from './date';

export interface ScheduleEntry {
  taskId: string;
  /** Early Start (indeks hari kerja). */
  earlyStart: number;
  /** Early Finish (indeks hari kerja). */
  earlyFinish: number;
  /** Late Start (indeks hari kerja). */
  lateStart: number;
  /** Late Finish (indeks hari kerja). */
  lateFinish: number;
  /** Total slack dalam hari kerja. */
  slack: number;
  critical: boolean;
  /** Tanggal mulai hasil jadwal (hari kerja). */
  startDate: string;
  /** Tanggal selesai hasil jadwal (hari kerja). */
  endDate: string;
}

export interface Schedule {
  entries: Record<string, ScheduleEntry>;
  /** Urutan topologis ID tugas. */
  order: string[];
  projectStart: string;
  projectEnd: string;
  /** Durasi proyek dalam hari kerja. */
  projectDuration: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Urutkan tugas dengan Kahn's algorithm. Jika ada siklus, tugas yang tersisa
 * diurutkan secara eksplisit agar perhitungan tetap selesai (tanpa hang).
 */
export function topologicalOrder(tasks: Task[], dependencies: Dependency[]): string[] {
  const ids = tasks.map((t) => t.id);
  const idSet = new Set(ids);
  const indegree: Record<string, number> = {};
  const outgoing: Record<string, string[]> = {};
  for (const id of ids) {
    indegree[id] = 0;
    outgoing[id] = [];
  }
  for (const dep of dependencies) {
    if (!idSet.has(dep.predecessorId) || !idSet.has(dep.successorId)) continue;
    indegree[dep.successorId] += 1;
    outgoing[dep.predecessorId].push(dep.successorId);
  }
  const queue = ids.filter((id) => indegree[id] === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of outgoing[id]) {
      indegree[next] -= 1;
      if (indegree[next] === 0) queue.push(next);
    }
  }
  if (order.length < ids.length) {
    const seen = new Set(order);
    for (const id of ids) {
      if (!seen.has(id)) order.push(id);
    }
  }
  return order;
}

/**
 * Forward/backward pass CPM.
 *
 * - Early Start = max(tanggal mulai user, seluruh batasan predecessor).
 * - FS: ES_succ = EF_pred + 1 + lag (hari kerja).
 * - SS: ES_succ = ES_pred + lag.
 * - Tugas tanpa successor mendapat LF = akhir proyek.
 * - Slack = LS - ES; slack 0 = jalur kritis.
 *
 * `durationOf` memungkinkan perhitungan ulang dengan durasi lain (dipakai PERT).
 */
export function computeSchedule(
  state: ProjectState,
  durationOf?: (task: Task) => number,
): Schedule {
  const calendar: CalendarConfig = state.calendar;
  const taskMap = new Map(state.tasks.map((t) => [t.id, t]));
  const duration = (task: Task): number => {
    const value = durationOf ? durationOf(task) : task.duration;
    const rounded = Math.round(Number.isFinite(value) ? value : task.duration);
    return Math.max(1, rounded);
  };

  const incoming: Record<string, Dependency[]> = {};
  const outgoing: Record<string, Dependency[]> = {};
  for (const task of state.tasks) {
    incoming[task.id] = [];
    outgoing[task.id] = [];
  }
  for (const dep of state.dependencies) {
    if (!incoming[dep.successorId] || !outgoing[dep.predecessorId]) continue;
    outgoing[dep.predecessorId].push(dep);
    incoming[dep.successorId].push(dep);
  }

  const order = topologicalOrder(state.tasks, state.dependencies);

  // Forward pass
  const earlyStart = new Map<string, number>();
  for (const id of order) {
    const task = taskMap.get(id);
    if (!task) continue;
    let earliest = workIndex(task.startDate, calendar);
    for (const dep of incoming[id]) {
      const pred = taskMap.get(dep.predecessorId);
      const predEs = earlyStart.get(dep.predecessorId);
      if (!pred || predEs === undefined) continue;
      const predEf = predEs + duration(pred) - 1;
      const candidate = dep.type === 'FS' ? predEf + 1 + dep.lag : predEs + dep.lag;
      if (candidate > earliest) earliest = candidate;
    }
    earlyStart.set(id, earliest);
  }

  let startIndex = Number.POSITIVE_INFINITY;
  let endIndex = Number.NEGATIVE_INFINITY;
  for (const task of state.tasks) {
    const es = earlyStart.get(task.id);
    if (es === undefined) continue;
    startIndex = Math.min(startIndex, es);
    endIndex = Math.max(endIndex, es + duration(task) - 1);
  }
  if (!Number.isFinite(startIndex)) {
    startIndex = 0;
    endIndex = 0;
  }
  const projectEndIndex = endIndex;

  // Backward pass
  const lateStart = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const task = taskMap.get(id);
    if (!task) continue;
    const dur = duration(task);
    let latestStart: number | null = null;
    for (const dep of outgoing[id]) {
      const succ = taskMap.get(dep.successorId);
      const succLs = lateStart.get(dep.successorId);
      if (!succ || succLs === undefined) continue;
      const candidate = dep.type === 'FS' ? succLs - dep.lag - dur : succLs - dep.lag;
      if (latestStart === null || candidate < latestStart) latestStart = candidate;
    }
    const lateFinish = latestStart === null ? projectEndIndex : latestStart + dur - 1;
    lateStart.set(id, lateFinish - dur + 1);
  }

  const entries: Record<string, ScheduleEntry> = {};
  for (const task of state.tasks) {
    const es = earlyStart.get(task.id);
    const ls = lateStart.get(task.id);
    if (es === undefined || ls === undefined) continue;
    const dur = duration(task);
    const ef = es + dur - 1;
    const slack = Math.max(0, ls - es);
    entries[task.id] = {
      taskId: task.id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: ls + dur - 1,
      slack,
      critical: slack <= 0,
      startDate: dateFromWorkIndex(es, calendar),
      endDate: dateFromWorkIndex(ef, calendar),
    };
  }

  const hasTasks = state.tasks.length > 0;
  return {
    entries,
    order,
    projectStart: hasTasks ? dateFromWorkIndex(startIndex, calendar) : '',
    projectEnd: hasTasks ? dateFromWorkIndex(endIndex, calendar) : '',
    projectDuration: hasTasks ? endIndex - startIndex + 1 : 0,
    startIndex,
    endIndex,
  };
}

/** Daftar ID tugas pada jalur kritis, terurut topologis. */
export function criticalChainIds(schedule: Schedule): string[] {
  return schedule.order.filter((id) => schedule.entries[id]?.critical);
}

export interface PertEstimate {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  /** E = (O + 4M + P) / 6 */
  expected: number;
  /** Var = ((P - O) / 6)^2 */
  variance: number;
}

/**
 * Estimasi PERT. Nilai O dan P di-clamp agar O <= M <= P,
 * sehingga varian tidak pernah negatif.
 */
export function pertEstimate(task: Task): PertEstimate {
  const mostLikely = Math.max(1, task.duration);
  const rawOptimistic =
    Number.isFinite(task.optimistic) && task.optimistic > 0 ? task.optimistic : mostLikely;
  const rawPessimistic =
    Number.isFinite(task.pessimistic) && task.pessimistic > 0 ? task.pessimistic : mostLikely;
  const optimistic = Math.min(rawOptimistic, mostLikely);
  const pessimistic = Math.max(rawPessimistic, mostLikely);
  const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
  const variance = Math.pow((pessimistic - optimistic) / 6, 2);
  return { optimistic, mostLikely, pessimistic, expected, variance };
}
