import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { DependencyType, Priority, Task } from '../types';
import { PRIORITY_COLORS } from '../types';
import {
  addWorkingDays,
  countWorkingDays,
  formatDisplay,
  isValidISO,
  nextWorkingDay,
  todayISO,
} from '../utils/date';
import { createId } from '../utils/id';
import { createsDependencyCycle, isAncestor } from '../utils/tree';
import { useProject } from '../store/ProjectContext';
import { Modal } from './Modal';

interface TaskFormModalProps {
  mode: 'create' | 'edit';
  task?: Task;
  defaultParentId?: string | null;
  onClose: () => void;
}

interface IncomingDep {
  key: string;
  /** ID dependensi tersimpan (undefined untuk dependensi baru). */
  depId?: string;
  predecessorId: string;
  type: DependencyType;
  lag: number;
}

const SWATCH_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#22c55e',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
  '#64748b',
];

export function TaskFormModal({ mode, task, defaultParentId, onClose }: TaskFormModalProps) {
  const { state, dispatch } = useProject();

  const [draft, setDraft] = useState<Task>(() =>
    task
      ? { ...task, assigneeIds: [...task.assigneeIds] }
      : {
          id: createId(),
          name: '',
          parentId: defaultParentId ?? null,
          startDate: nextWorkingDay(todayISO(), state.calendar),
          duration: 3,
          priority: 'Medium',
          color: PRIORITY_COLORS.Medium,
          assigneeIds: [],
          optimistic: 3,
          pessimistic: 3,
        },
  );
  const [error, setError] = useState('');
  const [newDep, setNewDep] = useState<{
    predecessorId: string;
    type: DependencyType;
    lag: number;
  }>({ predecessorId: '', type: 'FS', lag: 0 });

  const initialIncoming = useRef<IncomingDep[]>(
    state.dependencies
      .filter((d) => d.successorId === draft.id)
      .map((d) => ({
        key: d.id,
        depId: d.id,
        predecessorId: d.predecessorId,
        type: d.type,
        lag: d.lag,
      })),
  );
  const [incoming, setIncoming] = useState<IncomingDep[]>(initialIncoming.current);

  // Kandidat induk & predecessor: tugas lain di luar dirinya dan keturunannya.
  const parentOptions = useMemo(
    () => state.tasks.filter((t) => t.id !== draft.id && !isAncestor(state.tasks, draft.id, t.id)),
    [state.tasks, draft.id],
  );

  const startDate = isValidISO(draft.startDate) ? draft.startDate : todayISO();
  const duration = Math.max(1, Math.round(draft.duration) || 1);
  const endDate = addWorkingDays(startDate, duration - 1, state.calendar);
  const workingDays = countWorkingDays(startDate, endDate, state.calendar);

  const toggleAssignee = (memberId: string): void => {
    setDraft((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(memberId)
        ? prev.assigneeIds.filter((id) => id !== memberId)
        : [...prev.assigneeIds, memberId],
    }));
  };

  const addDependency = (): void => {
    if (!newDep.predecessorId) {
      setError('Pilih tugas pendahulu terlebih dahulu.');
      return;
    }
    if (createsDependencyCycle(state.dependencies, newDep.predecessorId, draft.id)) {
      setError('Dependensi tersebut akan membuat siklus dan tidak diizinkan.');
      return;
    }
    if (incoming.some((d) => d.predecessorId === newDep.predecessorId && d.type === newDep.type)) {
      setError('Tugas pendahulu tersebut sudah terdaftar.');
      return;
    }
    const lag = Math.max(0, Math.round(newDep.lag) || 0);
    setIncoming((prev) => [
      ...prev,
      { key: `new-${createId()}`, predecessorId: newDep.predecessorId, type: newDep.type, lag },
    ]);
    setNewDep({ predecessorId: '', type: 'FS', lag: 0 });
    setError('');
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setError('Nama tugas wajib diisi.');
      return;
    }
    if (!isValidISO(draft.startDate)) {
      setError('Tanggal mulai tidak valid.');
      return;
    }
    const safeDuration = Math.min(1000, Math.max(1, Math.round(draft.duration) || 1));
    const optimistic = Math.min(Math.max(1, Math.round(draft.optimistic) || 1), safeDuration);
    const pessimistic = Math.max(Math.round(draft.pessimistic) || safeDuration, safeDuration);
    const finalTask: Task = {
      ...draft,
      name,
      duration: safeDuration,
      optimistic,
      pessimistic,
      assigneeIds: [...new Set(draft.assigneeIds)],
    };

    if (mode === 'create') {
      dispatch({ type: 'ADD_TASK', task: finalTask });
    } else {
      dispatch({
        type: 'UPDATE_TASK',
        id: draft.id,
        patch: {
          name: finalTask.name,
          parentId: finalTask.parentId,
          startDate: finalTask.startDate,
          duration: finalTask.duration,
          priority: finalTask.priority,
          color: finalTask.color,
          assigneeIds: finalTask.assigneeIds,
          optimistic: finalTask.optimistic,
          pessimistic: finalTask.pessimistic,
        },
      });
    }

    // Sinkronkan dependensi masuk (predecessors).
    const keptIds = new Set(incoming.map((d) => d.depId).filter((id): id is string => Boolean(id)));
    for (const original of initialIncoming.current) {
      if (original.depId && !keptIds.has(original.depId)) {
        dispatch({ type: 'DELETE_DEPENDENCY', id: original.depId });
      }
    }
    const originalById = new Map(
      initialIncoming.current.filter((d) => d.depId).map((d) => [d.depId as string, d]),
    );
    for (const item of incoming) {
      if (item.depId) {
        const original = originalById.get(item.depId);
        if (original && (original.type !== item.type || original.lag !== item.lag)) {
          dispatch({
            type: 'UPDATE_DEPENDENCY',
            id: item.depId,
            patch: { type: item.type, lag: item.lag },
          });
        }
      } else {
        dispatch({
          type: 'ADD_DEPENDENCY',
          dependency: {
            predecessorId: item.predecessorId,
            successorId: draft.id,
            type: item.type,
            lag: item.lag,
          },
        });
      }
    }

    onClose();
  };

  const predecessorName = (id: string): string =>
    state.tasks.find((t) => t.id === id)?.name ?? '(tugas terhapus)';

  return (
    <Modal
      title={mode === 'create' ? 'Tambah Tugas Baru' : `Edit Tugas: ${task?.name ?? ''}`}
      onClose={onClose}
      wide
    >
      <form className="task-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field field-span">
            <span className="field-label">Nama tugas *</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Contoh: Analisis Kebutuhan"
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Tugas induk (sub-tugas)</span>
            <select
              value={draft.parentId ?? ''}
              onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })}
            >
              <option value="">— Tugas utama (top level) —</option>
              {parentOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Prioritas</span>
            <select
              value={draft.priority}
              onChange={(e) => {
                const priority = e.target.value as Priority;
                setDraft((prev) => ({ ...prev, priority, color: PRIORITY_COLORS[priority] }));
              }}
            >
              <option value="Low">Rendah (Low)</option>
              <option value="Medium">Sedang (Medium)</option>
              <option value="High">Tinggi (High)</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Tanggal mulai *</span>
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Durasi (hari kerja) *</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={draft.duration}
              onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
              required
            />
          </label>

          <div className="field field-span color-field">
            <span className="field-label">Warna indikator bar</span>
            <div className="swatches">
              {SWATCH_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={draft.color === color ? 'swatch active' : 'swatch'}
                  style={{ backgroundColor: color }}
                  onClick={() => setDraft({ ...draft, color })}
                  aria-label={`Pilih warna ${color}`}
                />
              ))}
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                aria-label="Warna kustom"
              />
            </div>
            <span className="field-hint">
              Warna otomatis mengikuti prioritas, dan dapat diubah manual.
            </span>
          </div>

          <div className="field field-span pert-box">
            <span className="field-label">Estimasi PERT (hari kerja)</span>
            <div className="pert-row">
              <label className="field">
                <span className="field-label small">Optimis (O)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.optimistic}
                  onChange={(e) => setDraft({ ...draft, optimistic: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span className="field-label small">Pesimis (P)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.pessimistic}
                  onChange={(e) => setDraft({ ...draft, pessimistic: Number(e.target.value) })}
                />
              </label>
              <span className="field-hint">
                E = (O + 4M + P) / 6 — nilai otomatis disesuaikan agar O ≤ durasi ≤ P.
              </span>
            </div>
          </div>

          <div className="field field-span">
            <span className="field-label">Alokasi anggota tim</span>
            {state.members.length === 0 ? (
              <p className="field-hint">Belum ada anggota. Tambahkan di tab Sumber Daya.</p>
            ) : (
              <div className="chip-list">
                {state.members.map((member) => {
                  const active = draft.assigneeIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={active ? 'chip active' : 'chip'}
                      onClick={() => toggleAssignee(member.id)}
                    >
                      {member.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="field field-span">
            <span className="field-label">Predecessors (tugas pendahulu)</span>
            {incoming.length === 0 ? (
              <p className="field-hint">Belum ada dependensi masuk.</p>
            ) : (
              <ul className="dep-list">
                {incoming.map((item) => (
                  <li key={item.key} className="dep-item">
                    <span className="dep-name">{predecessorName(item.predecessorId)}</span>
                    <select
                      value={item.type}
                      onChange={(e) => {
                        const type = e.target.value as DependencyType;
                        setIncoming((prev) =>
                          prev.map((d) => (d.key === item.key ? { ...d, type } : d)),
                        );
                      }}
                      aria-label="Tipe dependensi"
                    >
                      <option value="FS">FS (Finish-to-Start)</option>
                      <option value="SS">SS (Start-to-Start)</option>
                    </select>
                    <label className="lag-input">
                      Lag:
                      <input
                        type="number"
                        min={0}
                        value={item.lag}
                        onChange={(e) => {
                          const lag = Math.max(0, Math.round(Number(e.target.value)) || 0);
                          setIncoming((prev) =>
                            prev.map((d) => (d.key === item.key ? { ...d, lag } : d)),
                          );
                        }}
                      />
                      hari
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Hapus dependensi"
                      onClick={() =>
                        setIncoming((prev) => prev.filter((d) => d.key !== item.key))
                      }
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="dep-add">
              <select
                value={newDep.predecessorId}
                onChange={(e) => setNewDep({ ...newDep, predecessorId: e.target.value })}
                aria-label="Pilih tugas pendahulu"
              >
                <option value="">— Pilih pendahulu —</option>
                {parentOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                value={newDep.type}
                onChange={(e) =>
                  setNewDep({ ...newDep, type: e.target.value as DependencyType })
                }
                aria-label="Tipe dependensi baru"
              >
                <option value="FS">FS</option>
                <option value="SS">SS</option>
              </select>
              <label className="lag-input">
                Lag:
                <input
                  type="number"
                  min={0}
                  value={newDep.lag}
                  onChange={(e) =>
                    setNewDep({ ...newDep, lag: Math.max(0, Math.round(Number(e.target.value)) || 0) })
                  }
                />
                hari
              </label>
              <button type="button" className="btn" onClick={addDependency}>
                + Tambah
              </button>
            </div>
          </div>
        </div>

        <p className="preview-info">
          Perkiraan selesai: <strong>{formatDisplay(endDate)}</strong> — {workingDays} hari kerja
          (Sab/Ming dan hari libur tidak dihitung).
        </p>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary">
            Simpan Tugas
          </button>
        </div>
      </form>
    </Modal>
  );
}
