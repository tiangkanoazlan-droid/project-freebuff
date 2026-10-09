import { useState, type FormEvent } from 'react';
import { useProject } from './store/ProjectContext';
import { GanttView } from './components/GanttView';
import { ResourcesView } from './components/ResourcesView';
import { CalendarView } from './components/CalendarView';
import { AnalysisView } from './components/AnalysisView';

type Tab = 'gantt' | 'resources' | 'calendar' | 'analysis';

const TABS: { id: Tab; label: string }[] = [
  { id: 'gantt', label: 'Gantt Chart' },
  { id: 'resources', label: 'Sumber Daya' },
  { id: 'calendar', label: 'Kalender' },
  { id: 'analysis', label: 'Analisis' },
];

export default function App() {
  const { state, dispatch } = useProject();
  const [tab, setTab] = useState<Tab>('gantt');
  const [highlightCritical, setHighlightCritical] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const startEditName = (): void => {
    setNameDraft(state.projectName);
    setEditingName(true);
  };

  const submitName = (event: FormEvent): void => {
    event.preventDefault();
    dispatch({ type: 'SET_PROJECT_NAME', name: nameDraft });
    setEditingName(false);
  };

  const resetSeed = (): void => {
    if (window.confirm('Kembalikan seluruh data ke contoh awal? Perubahan Anda akan hilang.')) {
      dispatch({ type: 'RESET_SEED' });
      setHighlightCritical(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="14" height="4" rx="2" fill="currentColor" />
              <rect x="6" y="10" width="14" height="4" rx="2" fill="currentColor" opacity="0.75" />
              <rect x="10" y="16" width="10" height="4" rx="2" fill="currentColor" opacity="0.5" />
            </svg>
          </span>
          <div className="brand-text">
            <h1>Manajemen Proyek</h1>
            {editingName ? (
              <form className="project-name-form" onSubmit={submitName}>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  autoFocus
                  aria-label="Nama proyek"
                />
                <button type="submit" className="btn btn-primary small">
                  Simpan
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setEditingName(false)}
                >
                  Batal
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="project-name"
                onClick={startEditName}
                title="Klik untuk mengubah nama proyek"
              >
                {state.projectName} <span aria-hidden="true">✎</span>
              </button>
            )}
          </div>
        </div>

        <nav className="tabs" aria-label="Navigasi utama">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'tab active' : 'tab'}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <button type="button" className="btn ghost" onClick={resetSeed} title="Muat ulang data contoh">
            Reset Data Contoh
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === 'gantt' && (
          <GanttView
            highlightCritical={highlightCritical}
            onToggleHighlight={() => setHighlightCritical((prev) => !prev)}
          />
        )}
        {tab === 'resources' && <ResourcesView />}
        {tab === 'calendar' && <CalendarView />}
        {tab === 'analysis' && (
          <AnalysisView
            onShowCriticalInGantt={() => {
              setHighlightCritical(true);
              setTab('gantt');
            }}
          />
        )}
      </main>

      <footer className="app-footer">
        Data tersimpan otomatis di localStorage • Durasi dihitung dalam hari kerja •
        Dependensi FS/SS dengan lag hari kerja
      </footer>
    </div>
  );
}
