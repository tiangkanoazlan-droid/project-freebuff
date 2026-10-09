import type { Dependency, Holiday, Member, Priority, ProjectState, Task } from '../types';
import { createSeedState } from '../data/seed';
import { isValidISO, nextWorkingDay } from '../utils/date';
import { createsDependencyCycle, getSubtreeIds, isAncestor } from '../utils/tree';
import { createId } from '../utils/id';

export type ProjectAction =
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'UPDATE_TASK'; id: string; patch: Partial<Omit<Task, 'id'>> }
  | { type: 'DELETE_TASK'; id: string }
  | { type: 'ADD_DEPENDENCY'; dependency: Omit<Dependency, 'id'> }
  | { type: 'UPDATE_DEPENDENCY'; id: string; patch: Partial<Omit<Dependency, 'id'>> }
  | { type: 'DELETE_DEPENDENCY'; id: string }
  | { type: 'ADD_MEMBER'; member: Member }
  | { type: 'UPDATE_MEMBER'; id: string; patch: Partial<Omit<Member, 'id'>> }
  | { type: 'DELETE_MEMBER'; id: string }
  | { type: 'SET_WEEKEND_DAYS'; days: number[] }
  | { type: 'ADD_HOLIDAY'; holiday: Holiday }
  | { type: 'REMOVE_HOLIDAY'; id: string }
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'LOAD_STATE'; state: ProjectState }
  | { type: 'RESET_SEED' };

const MAX_DURATION = 1000;
const MAX_LAG = 999;
const VALID_PRIORITIES: Priority[] = ['Low', 'Medium', 'High'];

function clampDuration(value: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(MAX_DURATION, Math.max(1, parsed));
}

function clampLag(value: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_LAG, Math.max(0, parsed));
}

function sanitizeWeekendDays(days: number[]): number[] {
  const unique = new Set<number>();
  for (const day of days) {
    const parsed = Math.round(Number(day));
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 6) unique.add(parsed);
  }
  return [...unique].sort((a, b) => a - b);
}

function sanitizeTask(task: Task, state: ProjectState): Task {
  const memberIds = new Set(state.members.map((m) => m.id));
  const duration = clampDuration(task.duration);
  return {
    ...task,
    name: task.name.trim(),
    startDate: nextWorkingDay(
      isValidISO(task.startDate) ? task.startDate : state.startDate,
      state.calendar,
    ),
    duration,
    priority: VALID_PRIORITIES.includes(task.priority) ? task.priority : 'Medium',
    color: task.color || '#3b82f6',
    assigneeIds: [...new Set(task.assigneeIds)].filter((id) => memberIds.has(id)),
    optimistic: Math.max(1, Math.round(Number(task.optimistic) || duration)),
    pessimistic: Math.max(1, Math.round(Number(task.pessimistic) || duration)),
  };
}

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'ADD_TASK': {
      if (state.tasks.some((t) => t.id === action.task.id)) return state;
      const task = sanitizeTask(action.task, state);
      if (task.parentId && !state.tasks.some((t) => t.id === task.parentId)) {
        task.parentId = null;
      }
      return { ...state, tasks: [...state.tasks, task] };
    }

    case 'UPDATE_TASK': {
      let changed = false;
      const tasks = state.tasks.map((task) => {
        if (task.id !== action.id) return task;
        changed = true;
        const merged = sanitizeTask({ ...task, ...action.patch, id: task.id }, state);
        if (merged.parentId === task.id) merged.parentId = null;
        if (merged.parentId && isAncestor(state.tasks, task.id, merged.parentId)) {
          merged.parentId = task.parentId;
        }
        if (merged.parentId && !state.tasks.some((t) => t.id === merged.parentId)) {
          merged.parentId = null;
        }
        return merged;
      });
      return changed ? { ...state, tasks } : state;
    }

    case 'DELETE_TASK': {
      const removed = getSubtreeIds(state.tasks, action.id);
      if (!state.tasks.some((t) => t.id === action.id)) return state;
      return {
        ...state,
        tasks: state.tasks.filter((t) => !removed.has(t.id)),
        dependencies: state.dependencies.filter(
          (d) => !removed.has(d.predecessorId) && !removed.has(d.successorId),
        ),
      };
    }

    case 'ADD_DEPENDENCY': {
      const { predecessorId, successorId, type, lag } = action.dependency;
      if (predecessorId === successorId) return state;
      const taskIds = new Set(state.tasks.map((t) => t.id));
      if (!taskIds.has(predecessorId) || !taskIds.has(successorId)) return state;
      const duplicate = state.dependencies.some(
        (d) => d.predecessorId === predecessorId && d.successorId === successorId && d.type === type,
      );
      if (duplicate) return state;
      if (createsDependencyCycle(state.dependencies, predecessorId, successorId)) return state;
      const dependency: Dependency = {
        id: createId(),
        predecessorId,
        successorId,
        type: type === 'SS' ? 'SS' : 'FS',
        lag: clampLag(lag),
      };
      return { ...state, dependencies: [...state.dependencies, dependency] };
    }

    case 'UPDATE_DEPENDENCY': {
      let changed = false;
      const dependencies = state.dependencies.map((dep) => {
        if (dep.id !== action.id) return dep;
        changed = true;
        const merged: Dependency = { ...dep, ...action.patch, id: dep.id };
        merged.type = merged.type === 'SS' ? 'SS' : 'FS';
        merged.lag = clampLag(merged.lag);
        if (
          merged.predecessorId === merged.successorId ||
          !state.tasks.some((t) => t.id === merged.predecessorId) ||
          !state.tasks.some((t) => t.id === merged.successorId)
        ) {
          return dep;
        }
        return merged;
      });
      return changed ? { ...state, dependencies } : state;
    }

    case 'DELETE_DEPENDENCY': {
      const dependencies = state.dependencies.filter((d) => d.id !== action.id);
      if (dependencies.length === state.dependencies.length) return state;
      return { ...state, dependencies };
    }

    case 'ADD_MEMBER': {
      if (state.members.some((m) => m.id === action.member.id)) return state;
      const member: Member = {
        ...action.member,
        name: action.member.name.trim(),
        email: action.member.email.trim(),
        role: action.member.role.trim(),
        salary: Math.max(0, Math.round(Number(action.member.salary) || 0)),
      };
      return { ...state, members: [...state.members, member] };
    }

    case 'UPDATE_MEMBER': {
      let changed = false;
      const members = state.members.map((member) => {
        if (member.id !== action.id) return member;
        changed = true;
        const merged: Member = { ...member, ...action.patch, id: member.id };
        merged.name = merged.name.trim();
        merged.email = merged.email.trim();
        merged.role = merged.role.trim();
        merged.salary = Math.max(0, Math.round(Number(merged.salary) || 0));
        return merged;
      });
      return changed ? { ...state, members } : state;
    }

    case 'DELETE_MEMBER': {
      if (!state.members.some((m) => m.id === action.id)) return state;
      return {
        ...state,
        members: state.members.filter((m) => m.id !== action.id),
        tasks: state.tasks.map((task) =>
          task.assigneeIds.includes(action.id)
            ? { ...task, assigneeIds: task.assigneeIds.filter((id) => id !== action.id) }
            : task,
        ),
      };
    }

    case 'SET_WEEKEND_DAYS': {
      const weekendDays = sanitizeWeekendDays(action.days);
      if (
        weekendDays.length === state.calendar.weekendDays.length &&
        weekendDays.every((d, i) => d === state.calendar.weekendDays[i])
      ) {
        return state;
      }
      return { ...state, calendar: { ...state.calendar, weekendDays } };
    }

    case 'ADD_HOLIDAY': {
      const date = action.holiday.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return state;
      if (state.calendar.holidays.some((h) => h.date === date)) return state;
      const holiday: Holiday = {
        id: action.holiday.id || createId(),
        date,
        name: action.holiday.name.trim() || 'Hari Libur',
      };
      const holidays = [...state.calendar.holidays, holiday].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      return { ...state, calendar: { ...state.calendar, holidays } };
    }

    case 'REMOVE_HOLIDAY': {
      const holidays = state.calendar.holidays.filter((h) => h.id !== action.id);
      if (holidays.length === state.calendar.holidays.length) return state;
      return { ...state, calendar: { ...state.calendar, holidays } };
    }

    case 'SET_PROJECT_NAME': {
      const name = action.name.trim();
      if (!name || name === state.projectName) return state;
      return { ...state, projectName: name };
    }

    case 'LOAD_STATE':
      return action.state;

    case 'RESET_SEED':
      return createSeedState();

    default:
      return state;
  }
}

/** Validasi struktur hasil parse localStorage. */
export function isProjectState(value: unknown): value is ProjectState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProjectState>;
  return (
    typeof candidate.projectName === 'string' &&
    typeof candidate.startDate === 'string' &&
    Array.isArray(candidate.tasks) &&
    Array.isArray(candidate.dependencies) &&
    Array.isArray(candidate.members) &&
    typeof candidate.calendar === 'object' &&
    candidate.calendar !== null &&
    Array.isArray(candidate.calendar.weekendDays) &&
    Array.isArray(candidate.calendar.holidays)
  );
}
