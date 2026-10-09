import type { Task } from '../types';

export interface TaskRow {
  task: Task;
  /** Tingkat indentasi (0 = top-level). */
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

/**
 * Membentuk daftar baris Gantt dari hierarki parent-child,
 * mengikuti status collapse tiap tugas.
 */
export function buildTaskRows(tasks: Task[], collapsed: ReadonlySet<string>): TaskRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const childrenOf = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const parentKey = task.parentId && byId.has(task.parentId) ? task.parentId : null;
    const list = childrenOf.get(parentKey);
    if (list) {
      list.push(task);
    } else {
      childrenOf.set(parentKey, [task]);
    }
  }

  // Semua tugas yang dapat dicapai dari akar tanpa mempedulikan status collapse.
  // Dipakai untuk membedakan "tersembunyi karena induknya tertutup"
  // dengan "terputus karena siklus parent-child".
  const reachable = new Set<string>();
  const markReachable = (parentId: string | null): void => {
    for (const task of childrenOf.get(parentId) ?? []) {
      if (reachable.has(task.id)) continue;
      reachable.add(task.id);
      markReachable(task.id);
    }
  };
  markReachable(null);

  const rows: TaskRow[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number): void => {
    for (const task of childrenOf.get(parentId) ?? []) {
      if (visited.has(task.id)) continue;
      visited.add(task.id);
      const children = childrenOf.get(task.id) ?? [];
      const isCollapsed = collapsed.has(task.id);
      rows.push({ task, depth, hasChildren: children.length > 0, collapsed: isCollapsed });
      if (children.length > 0 && !isCollapsed) walk(task.id, depth + 1);
    }
  };
  walk(null, 0);

  // Fallback HANYA untuk tugas yang memang tak terjangkau dari akar
  // (terjebak siklus parent-child). Tugas yang sengaja disembunyikan oleh
  // collapse tetap terjangkau, sehingga tidak boleh dimasukkan kembali.
  for (const task of tasks) {
    if (visited.has(task.id) || reachable.has(task.id)) continue;
    visited.add(task.id);
    rows.push({ task, depth: 0, hasChildren: false, collapsed: false });
  }
  return rows;
}

/** Seluruh ID tugas dalam satu subpohon (termasuk akarnya). */
export function getSubtreeIds(tasks: Task[], rootId: string): Set<string> {
  const childrenOf = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const key = task.parentId;
    const list = childrenOf.get(key);
    if (list) {
      list.push(task);
    } else {
      childrenOf.set(key, [task]);
    }
  }
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child.id);
  }
  return result;
}

/** Apakah `candidateId` merupakan leluhur dari `taskId` (potensi siklus parent-child)? */
export function isAncestor(tasks: Task[], taskId: string, candidateId: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let cursor: string | null | undefined = candidateId;
  let guard = 0;
  while (cursor && guard < 10_000) {
    if (cursor === taskId) return true;
    cursor = byId.get(cursor)?.parentId ?? null;
    guard += 1;
  }
  return false;
}

/** Apakah menambahkan edge predecessor->successor akan membuat siklus dependensi? */
export function createsDependencyCycle(
  dependencies: DependencyLike[],
  predecessorId: string,
  successorId: string,
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = outgoing.get(dep.predecessorId);
    if (list) {
      list.push(dep.successorId);
    } else {
      outgoing.set(dep.predecessorId, [dep.successorId]);
    }
  }
  // Jika successor sudah bisa mencapai predecessor, edge baru membuat siklus.
  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === predecessorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? []) stack.push(next);
  }
  return false;
}

interface DependencyLike {
  predecessorId: string;
  successorId: string;
}
