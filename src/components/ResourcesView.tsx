import { useMemo, useState, type FormEvent } from 'react';
import type { Member, Task } from '../types';
import { formatCurrency } from '../utils/format';
import { PRIORITY_LABELS } from '../types';
import { useProject } from '../store/ProjectContext';
import { Modal } from './Modal';
import { createId } from '../utils/id';

/** Asumsi: 22 hari kerja per bulan untuk estimasi biaya tenaga kerja. */
const WORKING_DAYS_PER_MONTH = 22;

interface MemberFormState {
  mode: 'create' | 'edit';
  member?: Member;
}

interface MemberStats {
  tasks: Task[];
  days: number;
}

export function ResourcesView() {
  const { state, dispatch } = useProject();
  const [form, setForm] = useState<MemberFormState | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const map = new Map<string, MemberStats>();
    for (const member of state.members) map.set(member.id, { tasks: [], days: 0 });
    for (const task of state.tasks) {
      for (const assigneeId of task.assigneeIds) {
        const entry = map.get(assigneeId);
        if (!entry) continue;
        entry.tasks.push(task);
        entry.days += task.duration;
      }
    }
    return map;
  }, [state.members, state.tasks]);

  const handleDelete = (member: Member): void => {
    const allocated = stats.get(member.id)?.tasks.length ?? 0;
    const message =
      allocated > 0
        ? `Hapus anggota "${member.name}"? Alokasinya di ${allocated} tugas akan ikut dihapus.`
        : `Hapus anggota "${member.name}"?`;
    if (window.confirm(message)) {
      dispatch({ type: 'DELETE_MEMBER', id: member.id });
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Sumber Daya Manusia</h2>
          <p className="panel-sub">
            Daftar anggota tim, peran, gaji, dan alokasi ke tugas (diatur lewat form tugas).
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}>
          + Tambah Anggota
        </button>
      </div>

      {state.members.length === 0 ? (
        <div className="empty-state">
          <p>Belum ada anggota tim.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setForm({ mode: 'create' })}
          >
            + Tambah Anggota Pertama
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Peran</th>
                <th>Gaji / bulan</th>
                <th>Tugas</th>
                <th>Beban (hari kerja)</th>
                <th>Estimasi biaya</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {state.members.map((member) => {
                const memberStats = stats.get(member.id) ?? { tasks: [], days: 0 };
                const cost = (member.salary / WORKING_DAYS_PER_MONTH) * memberStats.days;
                const expanded = expandedId === member.id;
                return (
                  <tr key={member.id} className={expanded ? 'expanded' : ''}>
                    <td>
                      <button
                        type="button"
                        className="member-cell"
                        onClick={() => setExpandedId(expanded ? null : member.id)}
                        aria-expanded={expanded}
                      >
                        <span className="avatar">{member.name.slice(0, 1).toUpperCase()}</span>
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.email}</small>
                        </span>
                      </button>
                    </td>
                    <td>{member.role || '—'}</td>
                    <td>{formatCurrency(member.salary)}</td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setExpandedId(expanded ? null : member.id)}
                      >
                        {memberStats.tasks.length} tugas
                      </button>
                    </td>
                    <td>{memberStats.days} hari</td>
                    <td>{formatCurrency(cost)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit anggota"
                        aria-label={`Edit ${member.name}`}
                        onClick={() => setForm({ mode: 'edit', member })}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Hapus anggota"
                        aria-label={`Hapus ${member.name}`}
                        onClick={() => handleDelete(member)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {expandedId && state.members.some((m) => m.id === expandedId) && (
        <div className="allocation-card">
          <h3>
            Alokasi:{' '}
            {state.members.find((m) => m.id === expandedId)?.name}
          </h3>
          {(stats.get(expandedId)?.tasks ?? []).length === 0 ? (
            <p className="field-hint">Belum dialokasikan ke tugas mana pun.</p>
          ) : (
            <ul className="allocation-list">
              {(stats.get(expandedId)?.tasks ?? []).map((task) => (
                <li key={task.id}>
                  <span className="color-chip" style={{ backgroundColor: task.color }} />
                  <span className="alloc-name">{task.name}</span>
                  <span className="alloc-meta">
                    {PRIORITY_LABELS[task.priority]} • {task.duration} hari kerja
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="hint">
        Estimasi biaya = (gaji bulanan ÷ {WORKING_DAYS_PER_MONTH} hari kerja) × total hari kerja
        tugas yang dialokasikan.
      </p>

      {form && (
        <MemberFormModal
          mode={form.mode}
          member={form.member}
          onClose={() => setForm(null)}
        />
      )}
    </section>
  );
}

interface MemberFormModalProps {
  mode: 'create' | 'edit';
  member?: Member;
  onClose: () => void;
}

function MemberFormModal({ mode, member, onClose }: MemberFormModalProps) {
  const { dispatch } = useProject();
  const [draft, setDraft] = useState<Member>(
    () =>
      member ?? {
        id: createId(),
        name: '',
        email: '',
        role: '',
        salary: 0,
      },
  );
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name) {
      setError('Nama anggota wajib diisi.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Format email tidak valid.');
      return;
    }
    const salary = Math.max(0, Math.round(draft.salary) || 0);
    if (mode === 'create') {
      dispatch({ type: 'ADD_MEMBER', member: { ...draft, name, email, salary } });
    } else {
      dispatch({
        type: 'UPDATE_MEMBER',
        id: draft.id,
        patch: { name, email, role: draft.role.trim(), salary },
      });
    }
    onClose();
  };

  return (
    <Modal
      title={mode === 'create' ? 'Tambah Anggota Tim' : `Edit Anggota: ${member?.name ?? ''}`}
      onClose={onClose}
    >
      <form className="task-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field field-span">
            <span className="field-label">Nama lengkap *</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Contoh: Budi Santoso"
              autoFocus
              required
            />
          </label>
          <label className="field field-span">
            <span className="field-label">Email *</span>
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="nama@contoh.id"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Peran</span>
            <input
              type="text"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              placeholder="Contoh: Frontend Developer"
            />
          </label>
          <label className="field">
            <span className="field-label">Gaji per bulan (Rp)</span>
            <input
              type="number"
              min={0}
              step={100_000}
              value={draft.salary}
              onChange={(e) => setDraft({ ...draft, salary: Number(e.target.value) })}
            />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary">
            Simpan Anggota
          </button>
        </div>
      </form>
    </Modal>
  );
}
