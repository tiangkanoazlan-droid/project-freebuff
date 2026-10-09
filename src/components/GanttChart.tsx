import {
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CalendarConfig, Dependency, Member, Task } from '../types';
import { PRIORITY_LABELS } from '../types';
import type { Schedule, ScheduleEntry } from '../utils/scheduling';
import type { TaskRow } from '../utils/tree';
import {
  addDays,
  addWorkingDays,
  countWorkingDays,
  DAY_NAMES,
  diffDays,
  formatDisplay,
  isHoliday,
  isWeekend,
  monthSegments,
  nextWorkingDay,
  todayISO,
} from '../utils/date';
import { initials } from '../utils/format';

const HEADER_H = 64;
const ROW_H = 40;

type DragMode = 'move' | 'resize-end' | 'resize-start';

interface DragState {
  taskId: string;
  mode: DragMode;
  startX: number;
  delta: number;
  originalStart: string;
  originalDuration: number;
}

interface GanttChartProps {
  rows: TaskRow[];
  schedule: Schedule;
  calendar: CalendarConfig;
  view: { from: string; days: number };
  dayWidth: number;
  dependencies: Dependency[];
  highlightCritical: boolean;
  membersById: Map<string, Member>;
  onToggleRow: (id: string) => void;
  onEdit: (task: Task) => void;
  onAddSubtask: (task: Task) => void;
  onDelete: (task: Task) => void;
  onUpdateTask: (id: string, patch: Partial<Pick<Task, 'startDate' | 'duration'>>) => void;
}

interface LinkGeometry {
  id: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
  critical: boolean;
}

export function GanttChart({
  rows,
  schedule,
  calendar,
  view,
  dayWidth,
  dependencies,
  highlightCritical,
  membersById,
  onToggleRow,
  onEdit,
  onAddSubtask,
  onDelete,
  onUpdateTask,
}: GanttChartProps) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const chartWidth = view.days * dayWidth;
  const rowsHeight = rows.length * ROW_H;
  const today = todayISO();

  const segments = useMemo(
    () => monthSegments(view.from, addDays(view.from, view.days - 1)),
    [view.from, view.days],
  );

  const stripes = useMemo(() => {
    const list: { index: number; kind: 'weekend' | 'holiday' }[] = [];
    for (let i = 0; i < view.days; i += 1) {
      const date = addDays(view.from, i);
      if (isHoliday(date, calendar)) {
        list.push({ index: i, kind: 'holiday' });
      } else if (isWeekend(date, calendar.weekendDays)) {
        list.push({ index: i, kind: 'weekend' });
      }
    }
    return list;
  }, [view.from, view.days, calendar]);

  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.task.id, index])),
    [rows],
  );

  const barLeft = (start: string): number => diffDays(view.from, start) * dayWidth;
  const barWidth = (start: string, end: string): number =>
    Math.max(dayWidth * 0.6, (diffDays(start, end) + 1) * dayWidth - 3);

  const links = useMemo<LinkGeometry[]>(() => {
    const result: LinkGeometry[] = [];
    for (const dep of dependencies) {
      const pi = rowIndexById.get(dep.predecessorId);
      const si = rowIndexById.get(dep.successorId);
      if (pi === undefined || si === undefined) continue;
      const predEntry = schedule.entries[dep.predecessorId];
      const succEntry = schedule.entries[dep.successorId];
      if (!predEntry || !succEntry) continue;

      const y1 = pi * ROW_H + ROW_H / 2;
      const y2 = si * ROW_H + ROW_H / 2;
      const x1 =
        dep.type === 'FS'
          ? (diffDays(view.from, predEntry.endDate) + 1) * dayWidth - 3
          : diffDays(view.from, predEntry.startDate) * dayWidth + 2;
      const x2 = diffDays(view.from, succEntry.startDate) * dayWidth - 5;
      const bend = Math.min(90, Math.max(24, Math.abs(x2 - x1) / 2));
      const label = dep.lag > 0 ? `${dep.type} +${dep.lag}` : dep.type;
      result.push({
        id: dep.id,
        path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        label,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 7,
        critical: highlightCritical && predEntry.critical && succEntry.critical,
      });
    }
    return result;
  }, [dependencies, rowIndexById, schedule, view.from, dayWidth, highlightCritical]);

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    task: Task,
    mode: DragMode,
    entry: ScheduleEntry,
  ): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    if (typeof element.setPointerCapture === 'function') {
      element.setPointerCapture(event.pointerId);
    }
    setDrag({
      taskId: task.id,
      mode,
      startX: event.clientX,
      delta: 0,
      originalStart: entry.startDate,
      originalDuration: task.duration,
    });
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!drag) return;
    const delta = Math.round((event.clientX - drag.startX) / dayWidth);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!drag) return;
    const element = event.currentTarget;
    if (
      typeof element.releasePointerCapture === 'function' &&
      element.hasPointerCapture(event.pointerId)
    ) {
      element.releasePointerCapture(event.pointerId);
    }
    commitDrag(drag);
    setDrag(null);
  };

  const commitDrag = (current: DragState): void => {
    if (current.delta === 0) return;
    const originalEnd = addWorkingDays(
      current.originalStart,
      current.originalDuration - 1,
      calendar,
    );
    if (current.mode === 'move') {
      const startDate = nextWorkingDay(addDays(current.originalStart, current.delta), calendar);
      onUpdateTask(current.taskId, { startDate });
      return;
    }
    if (current.mode === 'resize-end') {
      const targetEnd = nextWorkingDay(addDays(originalEnd, current.delta), calendar);
      const duration = Math.max(1, countWorkingDays(current.originalStart, targetEnd, calendar));
      onUpdateTask(current.taskId, { duration });
      return;
    }
    const startDate = nextWorkingDay(addDays(current.originalStart, current.delta), calendar);
    const duration = Math.max(1, countWorkingDays(startDate, originalEnd, calendar));
    onUpdateTask(current.taskId, { startDate, duration });
  };

  const previewSpan = (task: Task, entry: ScheduleEntry): { start: string; end: string } => {
    if (!drag || drag.taskId !== task.id || drag.delta === 0) {
      return { start: entry.startDate, end: entry.endDate };
    }
    const originalEnd = addWorkingDays(drag.originalStart, drag.originalDuration - 1, calendar);
    if (drag.mode === 'move') {
      const start = nextWorkingDay(addDays(drag.originalStart, drag.delta), calendar);
      return { start, end: addWorkingDays(start, drag.originalDuration - 1, calendar) };
    }
    if (drag.mode === 'resize-end') {
      const end = nextWorkingDay(addDays(originalEnd, drag.delta), calendar);
      return {
        start: drag.originalStart,
        end: diffDays(drag.originalStart, end) < 0 ? drag.originalStart : end,
      };
    }
    const start = nextWorkingDay(addDays(drag.originalStart, drag.delta), calendar);
    return { start, end: diffDays(start, originalEnd) < 0 ? start : originalEnd };
  };

  const gridStyle = {
    '--day-w': `${dayWidth}px`,
    width: `calc(var(--left-w) + ${chartWidth}px)`,
  } as CSSProperties;

  const todayIndex = diffDays(view.from, today);
  const showToday = todayIndex >= 0 && todayIndex < view.days;

  return (
    <div className="gantt-scroll">
      <div className="gantt-grid" style={gridStyle}>
        {/* Lapisan latar: akhir pekan, hari libur, garis hari ini */}
        <div
          className="gantt-stripes"
          style={{
            left: 'var(--left-w)',
            top: HEADER_H,
            width: chartWidth,
            height: rowsHeight,
          }}
          aria-hidden="true"
        >
          {stripes.map((stripe) => (
            <div
              key={stripe.index}
              className={stripe.kind === 'holiday' ? 'stripe holiday' : 'stripe weekend'}
              style={{ left: stripe.index * dayWidth, width: dayWidth }}
            />
          ))}
          {showToday && (
            <div className="today-marker" style={{ left: todayIndex * dayWidth }} title="Hari ini" />
          )}
        </div>

        {/* Header */}
        <div className="gantt-header-row" style={{ height: HEADER_H }}>
          <div className="gantt-left gantt-left-header">
            <div className="cell cell-name">Tugas</div>
            <div className="cell col-start">Mulai</div>
            <div className="cell col-duration">Durasi</div>
            <div className="cell col-priority">Prioritas</div>
            <div className="cell col-members">Anggota</div>
            <div className="cell col-actions">Aksi</div>
          </div>
          <div className="gantt-right gantt-right-header" style={{ width: chartWidth }}>
            <div className="month-row">
              {segments.map((segment) => (
                <div
                  key={segment.start}
                  className="month-cell"
                  style={{ width: segment.days * dayWidth }}
                >
                  {segment.label}
                </div>
              ))}
            </div>
            <div className="day-row">
              {Array.from({ length: view.days }, (_, index) => {
                const date = addDays(view.from, index);
                const weekend = isWeekend(date, calendar.weekendDays);
                const holiday = isHoliday(date, calendar);
                const className = [
                  'day-cell',
                  weekend ? 'weekend' : '',
                  holiday ? 'holiday' : '',
                  date === today ? 'today' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={date} className={className} style={{ width: dayWidth }}>
                    <span className="dow">{DAY_NAMES[diffDays('1970-01-04', date) % 7]}</span>
                    <span className="dnum">{Number(date.slice(8, 10))}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Baris tugas */}
        {rows.map((row) => {
          const task = row.task;
          const entry = schedule.entries[task.id];
          if (!entry) return null;
          const { start, end } = previewSpan(task, entry);
          const left = barLeft(start);
          const width = barWidth(start, end);
          const isDragging = drag?.taskId === task.id;
          const isCritical = highlightCritical && entry.critical;
          const members = task.assigneeIds
            .map((id) => membersById.get(id))
            .filter((m): m is Member => Boolean(m));

          return (
            <div
              key={task.id}
              className={isCritical ? 'gantt-row critical-row' : 'gantt-row'}
              style={{ height: ROW_H }}
            >
              {/* Kolom kiri (sticky) */}
              <div className="gantt-left">
                <div className="cell cell-name" style={{ paddingLeft: 8 + row.depth * 18 }}>
                  {row.hasChildren ? (
                    <button
                      type="button"
                      className="twisty"
                      onClick={() => onToggleRow(task.id)}
                      aria-label={row.collapsed ? 'Buka sub-tugas' : 'Tutup sub-tugas'}
                    >
                      {row.collapsed ? '▸' : '▾'}
                    </button>
                  ) : (
                    <span className="twisty-spacer" aria-hidden="true" />
                  )}
                  <span className="color-chip" style={{ backgroundColor: task.color }} />
                  <span className="task-name" title={task.name}>
                    {task.name}
                  </span>
                </div>
                <div className="cell col-start">{formatDisplay(entry.startDate)}</div>
                <div className="cell col-duration">{task.duration} hr</div>
                <div className="cell col-priority">
                  <span className={`prio-badge prio-${task.priority.toLowerCase()}`}>
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                </div>
                <div className="cell col-members">
                  {members.slice(0, 2).map((member) => (
                    <span
                      key={member.id}
                      className="avatar"
                      title={`${member.name} — ${member.role}`}
                    >
                      {initials(member.name)}
                    </span>
                  ))}
                  {members.length > 2 && <span className="avatar more">+{members.length - 2}</span>}
                </div>
                <div className="cell col-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Edit tugas"
                    aria-label={`Edit ${task.name}`}
                    onClick={() => onEdit(task)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Tambah sub-tugas"
                    aria-label={`Tambah sub-tugas di ${task.name}`}
                    onClick={() => onAddSubtask(task)}
                  >
                    ⊕
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="Hapus tugas"
                    aria-label={`Hapus ${task.name}`}
                    onClick={() => onDelete(task)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Area chart */}
              <div className="gantt-right" style={{ width: chartWidth }}>
                <div
                  className={[
                    'gantt-bar',
                    isCritical ? 'is-critical' : '',
                    isDragging ? 'is-dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left, width, backgroundColor: task.color }}
                  title={`${task.name} • ${formatDisplay(entry.startDate)} → ${formatDisplay(
                    entry.endDate,
                  )} • ${task.duration} hari kerja • Klik ganda untuk edit`}
                  onPointerDown={(event) => startDrag(event, task, 'move', entry)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  onDoubleClick={() => onEdit(task)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onEdit(task);
                  }}
                >
                  <span className="bar-label">{task.name}</span>
                  {width >= 84 && <span className="bar-duration">{task.duration} hr</span>}
                  <span
                    className="resize-handle start"
                    onPointerDown={(event) => startDrag(event, task, 'resize-start', entry)}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    title="Seret untuk mengubah tanggal mulai"
                  />
                  <span
                    className="resize-handle end"
                    onPointerDown={(event) => startDrag(event, task, 'resize-end', entry)}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    title="Seret untuk mengubah durasi"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Panah dependensi */}
        <svg
          className="gantt-links"
          style={{ left: 'var(--left-w)', top: HEADER_H, width: chartWidth, height: rowsHeight }}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrow-default"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6 z" fill="#64748b" />
            </marker>
            <marker
              id="arrow-critical"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6 z" fill="#dc2626" />
            </marker>
          </defs>
          {links.map((link) => (
            <g key={link.id}>
              <path
                d={link.path}
                fill="none"
                stroke={link.critical ? '#dc2626' : '#64748b'}
                strokeWidth={link.critical ? 2 : 1.5}
                markerEnd={link.critical ? 'url(#arrow-critical)' : 'url(#arrow-default)'}
              />
              <text
                x={link.labelX}
                y={link.labelY}
                textAnchor="middle"
                fontSize={10}
                fill={link.critical ? '#dc2626' : '#475569'}
                className="link-label"
              >
                {link.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
