import { useMemo, useState } from 'react';
import type { Task } from '../types';
import { addDays, diffDays, startOfWeek, todayISO } from '../utils/date';
import { buildTaskRows, getSubtreeIds } from '../utils/tree';
import { computeSchedule } from '../utils/scheduling';
import { useProject } from '../store/ProjectContext';
import { TaskFormModal } from './TaskFormModal';
import { GanttChart } from './GanttChart';

interface GanttViewProps {
  highlightCritical: boolean;
  onToggleHighlight: () => void;
}

interface FormState {
  mode: 'create' | 'edit';
  task?: Task;
  parentId?: string | null;
}

const ZOOM_LEVELS = [18, 24, 32, 44];

export function GanttView({ highlightCritical, onToggleHighlight }: GanttViewProps) {
  const { state, dispatch } = useProject();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [zoomIndex, setZoomIndex] = useState(1);
  const [form, setForm] = useState<FormState | null>(null);

  const schedule = useMemo(() => computeSchedule(state), [state]);
  const membersById = useMemo(
    () => new Map(state.members.map((m) => [m.id, m])),
    [state.members],
  );

  const rows = useMemo(() => {
    const base = buildTaskRows(state.tasks, query.trim() ? new Set<string>() : collapsed);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((row) => row.task.name.toLowerCase().includes(q));
  }, [state.tasks, collapsed, query]);

  const view = useMemo(() => {
    const today = todayISO();
    let minDate = today;
    let maxDate = today;
    for (const task of state.tasks) {
      const entry = schedule.entries[task.id];
      const start = entry?.startDate ?? task.startDate;
      const end = entry?.endDate ?? start;
      if (start < minDate) minDate = start;
      if (end > maxDate) maxDate = end;
    }
    const from = startOfWeek(addDays(minDate, -7));
    const to = addDays(maxDate, 21);
    return { from, days: diffDays(from, to) + 1 };
  }, [state.tasks, schedule]);

  const toggleRow = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = (): void => setCollapsed(new Set());
  const collapseAll = (): void => {
    const parents = new Set(
      state.tasks.filter((t) => state.tasks.some((c) => c.parentId === t.id)).map((t) => t.id),
    );
    setCollapsed(parents);
  };

  const handleDelete = (task: Task): void => {
    const subtreeSize = getSubtreeIds(state.tasks, task.id).size;
    const message =
      subtreeSize > 1
        ? `Hapus "${task.name}" beserta ${subtreeSize - 1} sub-tugas dan seluruh dependensinya?`
        : `Hapus tugas "${task.name}"?`;
    if (window.confirm(message)) {
      dispatch({ type: 'DELETE_TASK', id: task.id });
    }
  };

  const dayWidth = ZOOM_LEVELS[zoomIndex];

  return (
    <section className="gantt-view">
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setForm({ mode: 'create', parentId: null })}
        >
          + Tugas Baru
        </button>

        <input
          type="search"
          className="search-input"
          placeholder="Cari tugas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cari tugas"
        />

        <div className="toolbar-group">
          <button
            type="button"
            className="btn"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            aria-label="Perkecil"
            title="Perkecil"
          >
            −
          </button>
          <span className="zoom-label">{Math.round((dayWidth / 24) * 100)}%</span>
          <button
            type="button"
            className="btn"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            aria-label="Perbesar"
            title="Perbesar"
          >
            +
          </button>
        </div>

        <button type="button" className="btn" onClick={collapseAll}>
          Tutup Semua
        </button>
        <button type="button" className="btn" onClick={expandAll}>
          Buka Semua
        </button>

        <label className="toggle">
          <input type="checkbox" checked={highlightCritical} onChange={onToggleHighlight} />
          <span>Jalur kritis</span>
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>{state.tasks.length === 0 ? 'Belum ada tugas.' : 'Tugas tidak ditemukan.'}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setForm({ mode: 'create', parentId: null })}
          >
            + Tambah Tugas Pertama
          </button>
        </div>
      ) : (
        <GanttChart
          rows={rows}
          schedule={schedule}
          calendar={state.calendar}
          view={view}
          dayWidth={dayWidth}
          dependencies={state.dependencies}
          highlightCritical={highlightCritical}
          membersById={membersById}
          onToggleRow={toggleRow}
          onEdit={(task) => setForm({ mode: 'edit', task })}
          onAddSubtask={(task) => setForm({ mode: 'create', parentId: task.id })}
          onDelete={handleDelete}
          onUpdateTask={(id, patch) => dispatch({ type: 'UPDATE_TASK', id, patch })}
        />
      )}

      {form && (
        <TaskFormModal
          mode={form.mode}
          task={form.task}
          defaultParentId={form.parentId}
          onClose={() => setForm(null)}
        />
      )}

      <p className="hint">
        Bar dapat <strong>digeser</strong> (klik-tahan lalu seret) untuk mengubah tanggal mulai, dan
        <strong> diubah ukurannya</strong> dari tepi kanan/kiri untuk mengubah durasi hari kerja.
        Klik ganda bar untuk mengedit. Tanggal mulai otomatis digest ke hari kerja terdekat.
      </p>
    </section>
  );
}
