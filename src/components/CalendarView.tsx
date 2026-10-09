import { useMemo, useState, type FormEvent } from 'react';
import { DAY_NAMES, isHoliday, isWeekend, parseDate, todayISO } from '../utils/date';
import { useProject } from '../store/ProjectContext';
import { createId } from '../utils/id';

const WEEK_OPTIONS = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' },
  { value: 0, label: 'Minggu' },
];

export function CalendarView() {
  const { state, dispatch } = useProject();
  const [monthCursor, setMonthCursor] = useState(() => todayISO().slice(0, 7));
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [error, setError] = useState('');

  const toggleWeekend = (day: number): void => {
    const current = new Set(state.calendar.weekendDays);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    dispatch({ type: 'SET_WEEKEND_DAYS', days: [...current] });
  };

  const addHoliday = (event: FormEvent): void => {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
      setError('Pilih tanggal hari libur terlebih dahulu.');
      return;
    }
    if (state.calendar.holidays.some((h) => h.date === holidayDate)) {
      setError('Tanggal tersebut sudah terdaftar sebagai hari libur.');
      return;
    }
    dispatch({
      type: 'ADD_HOLIDAY',
      holiday: {
        id: createId(),
        date: holidayDate,
        name: holidayName.trim() || 'Hari Libur',
      },
    });
    setHolidayDate('');
    setHolidayName('');
    setError('');
  };

  // Grid pratinjau bulan (Senin pertama).
  const previewDays = useMemo(() => {
    const [year, month] = monthCursor.split('-').map(Number);
    const firstOfMonth = `${monthCursor}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leading = (parseDate(firstOfMonth).getUTCDay() + 6) % 7;
    const cells: { date: string | null }[] = [];
    for (let i = 0; i < leading; i += 1) cells.push({ date: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: `${monthCursor}-${String(day).padStart(2, '0')}` });
    }
    return cells;
  }, [monthCursor]);

  const shiftMonth = (offset: number): void => {
    const [year, month] = monthCursor.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    setMonthCursor(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const holidayCount = state.calendar.holidays.length;
  const weekendCount = state.calendar.weekendDays.length;
  const today = todayISO();

  return (
    <section className="calendar-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Kalender Proyek</h2>
            <p className="panel-sub">
              Durasi tugas selalu dihitung dalam <strong>hari kerja</strong>: di luar akhir pekan dan
              hari libur khusus.
            </p>
          </div>
        </div>

        <h3 className="section-title">Akhir pekan</h3>
        <div className="weekend-grid">
          {WEEK_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={
                state.calendar.weekendDays.includes(option.value)
                  ? 'weekend-toggle active'
                  : 'weekend-toggle'
              }
            >
              <input
                type="checkbox"
                checked={state.calendar.weekendDays.includes(option.value)}
                onChange={() => toggleWeekend(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">
          {weekendCount === 0
            ? 'Tidak ada akhir pekan — semua hari dihitung sebagai hari kerja.'
            : `${weekendCount} hari dianggap akhir pekan.`}
        </p>

        <h3 className="section-title">Hari libur khusus</h3>
        <form className="holiday-form" onSubmit={addHoliday}>
          <input
            type="date"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            aria-label="Tanggal hari libur"
            required
          />
          <input
            type="text"
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="Nama hari libur (mis. Hari Natal)"
            aria-label="Nama hari libur"
          />
          <button type="submit" className="btn btn-primary">
            + Tambah
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}

        {holidayCount === 0 ? (
          <p className="field-hint">Belum ada hari libur khusus.</p>
        ) : (
          <ul className="holiday-list">
            {[...state.calendar.holidays]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((holiday) => (
                <li key={holiday.id}>
                  <span className="holiday-date">{holiday.date}</span>
                  <span className="holiday-name">{holiday.name}</span>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Hapus hari libur ${holiday.name}`}
                    title="Hapus hari libur"
                    onClick={() => dispatch({ type: 'REMOVE_HOLIDAY', id: holiday.id })}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Pratinjau Kalender</h2>
            <p className="panel-sub">Hijau = hari kerja, abu = akhir pekan, oranye = hari libur.</p>
          </div>
          <div className="toolbar-group">
            <button type="button" className="btn" onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya">
              ‹
            </button>
            <span className="zoom-label">{monthCursor}</span>
            <button type="button" className="btn" onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya">
              ›
            </button>
          </div>
        </div>

        <div className="mini-calendar">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <div key={day} className="mini-dow">
              {DAY_NAMES[day]}
            </div>
          ))}
          {previewDays.map((cell, index) => {
            if (!cell.date) return <div key={`blank-${index}`} className="mini-cell blank" />;
            const holiday = isHoliday(cell.date, state.calendar);
            const weekend = isWeekend(cell.date, state.calendar.weekendDays);
            const className = [
              'mini-cell',
              holiday ? 'holiday' : weekend ? 'weekend' : 'working',
              cell.date === today ? 'today' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const holidayLabel = state.calendar.holidays.find((h) => h.date === cell.date)?.name;
            return (
              <div
                key={cell.date}
                className={className}
                title={holidayLabel ? `${cell.date} — ${holidayLabel}` : cell.date}
              >
                {Number(cell.date.slice(8, 10))}
                {holidayLabel && <small>{holidayLabel}</small>}
              </div>
            );
          })}
        </div>

        <div className="legend">
          <span className="legend-item"><i className="dot working" /> Hari kerja</span>
          <span className="legend-item"><i className="dot weekend" /> Akhir pekan</span>
          <span className="legend-item"><i className="dot holiday" /> Hari libur</span>
        </div>
      </div>
    </section>
  );
}
