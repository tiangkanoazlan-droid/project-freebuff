import { useMemo } from 'react';
import type { Task } from '../types';
import {
  computeSchedule,
  criticalChainIds,
  pertEstimate,
} from '../utils/scheduling';
import { dateFromWorkIndex, formatDisplay } from '../utils/date';
import { formatDecimal, truncate } from '../utils/format';
import { useProject } from '../store/ProjectContext';

interface AnalysisViewProps {
  onShowCriticalInGantt: () => void;
}

const NODE_W = 176;
const NODE_H = 62;
const H_GAP = 64;
const V_GAP = 26;

interface PertNode {
  task: Task;
  level: number;
  row: number;
  x: number;
  y: number;
}

interface PertEdge {
  id: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
}

export function AnalysisView({ onShowCriticalInGantt }: AnalysisViewProps) {
  const { state } = useProject();

  const schedule = useMemo(() => computeSchedule(state), [state]);
  const pertSchedule = useMemo(
    () => computeSchedule(state, (task) => pertEstimate(task).expected),
    [state],
  );

  const criticalIds = useMemo(() => criticalChainIds(schedule), [schedule]);
  const pertPathIds = useMemo(() => criticalChainIds(pertSchedule), [pertSchedule]);

  const pertStats = useMemo(() => {
    let mu = 0;
    let variance = 0;
    for (const id of pertPathIds) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) continue;
      const estimate = pertEstimate(task);
      mu += estimate.expected;
      variance += estimate.variance;
    }
    const sigma = Math.sqrt(variance);
    const startIdx = pertSchedule.startIndex;
    const endIdxMu = startIdx + Math.max(0, Math.ceil(mu) - 1);
    const endIdxSigma = startIdx + Math.max(0, Math.ceil(mu + sigma) - 1);
    return {
      mu,
      variance,
      sigma,
      finishMu: pertSchedule.order.length ? dateFromWorkIndex(endIdxMu, state.calendar) : '',
      finishSigma: pertSchedule.order.length ? dateFromWorkIndex(endIdxSigma, state.calendar) : '',
    };
  }, [pertPathIds, pertSchedule, state.tasks, state.calendar]);

  const { nodes, edges, svgWidth, svgHeight } = useMemo(() => {
    const levelOf = new Map<string, number>();
    for (const id of pertSchedule.order) {
      const predecessors = state.dependencies
        .filter((d) => d.successorId === id)
        .map((d) => d.predecessorId);
      let level = 0;
      for (const pred of predecessors) {
        level = Math.max(level, (levelOf.get(pred) ?? 0) + 1);
      }
      levelOf.set(id, level);
    }

    const byLevel = new Map<number, Task[]>();
    for (const task of state.tasks) {
      const level = levelOf.get(task.id) ?? 0;
      const list = byLevel.get(level);
      if (list) list.push(task);
      else byLevel.set(level, [task]);
    }

    const nodeMap = new Map<string, PertNode>();
    let maxRow = 0;
    let maxLevel = 0;
    for (const [level, tasks] of byLevel) {
      maxLevel = Math.max(maxLevel, level);
      tasks.forEach((task, row) => {
        maxRow = Math.max(maxRow, row);
        nodeMap.set(task.id, {
          task,
          level,
          row,
          x: 24 + level * (NODE_W + H_GAP),
          y: 24 + row * (NODE_H + V_GAP),
        });
      });
    }

    const linkList: PertEdge[] = [];
    for (const dep of state.dependencies) {
      const from = nodeMap.get(dep.predecessorId);
      const to = nodeMap.get(dep.successorId);
      if (!from || !to) continue;
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const bend = Math.max(28, Math.abs(x2 - x1) / 2);
      linkList.push({
        id: dep.id,
        path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        label: dep.lag > 0 ? `${dep.type} +${dep.lag}` : dep.type,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 6,
      });
    }

    return {
      nodes: [...nodeMap.values()],
      edges: linkList,
      svgWidth: 48 + (maxLevel + 1) * (NODE_W + H_GAP),
      svgHeight: 48 + (maxRow + 1) * (NODE_H + V_GAP),
    };
  }, [pertSchedule.order, state.tasks, state.dependencies]);

  const dependencyLabel = (fromId: string, toId: string): string | null => {
    const dep = state.dependencies.find(
      (d) => d.predecessorId === fromId && d.successorId === toId,
    );
    if (!dep) return null;
    return dep.lag > 0 ? `${dep.type} +${dep.lag} hari` : dep.type;
  };

  const noTasks = state.tasks.length === 0;

  return (
    <section className="analysis-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Jalur Kritis (Critical Path)</h2>
            <p className="panel-sub">
              Rantai tugas dengan slack = 0; keterlambatannya menunda seluruh proyek.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={onShowCriticalInGantt}>
            Tandai di Gantt Chart
          </button>
        </div>

        {noTasks ? (
          <p className="field-hint">Belum ada tugas untuk dianalisis.</p>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Durasi proyek</span>
                <span className="stat-value">{schedule.projectDuration} hari kerja</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Mulai</span>
                <span className="stat-value">{formatDisplay(schedule.projectStart)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Selesai</span>
                <span className="stat-value">{formatDisplay(schedule.projectEnd)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Tugas kritis</span>
                <span className="stat-value">
                  {criticalIds.length} / {state.tasks.length}
                </span>
              </div>
            </div>

            <ol className="critical-chain">
              {criticalIds.map((id, index) => {
                const task = state.tasks.find((t) => t.id === id);
                const entry = schedule.entries[id];
                if (!task || !entry) return null;
                const nextId = criticalIds[index + 1];
                const label = nextId ? dependencyLabel(id, nextId) : null;
                return (
                  <li key={id}>
                    <div className="chain-node">
                      <span className="color-chip" style={{ backgroundColor: task.color }} />
                      <div>
                        <strong>{task.name}</strong>
                        <small>
                          {formatDisplay(entry.startDate)} → {formatDisplay(entry.endDate)} •{' '}
                          {task.duration} hari kerja • slack {entry.slack}
                        </small>
                      </div>
                    </div>
                    {label && <span className="chain-arrow">→ {label}</span>}
                  </li>
                );
              })}
            </ol>

            <div className="slack-table table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tugas</th>
                    <th>ES</th>
                    <th>EF</th>
                    <th>LS</th>
                    <th>LF</th>
                    <th>Slack</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.order.map((id) => {
                    const entry = schedule.entries[id];
                    const task = state.tasks.find((t) => t.id === id);
                    if (!entry || !task) return null;
                    return (
                      <tr key={id} className={entry.critical ? 'critical-row' : ''}>
                        <td>{task.name}</td>
                        <td>{formatDisplay(entry.startDate)}</td>
                        <td>{formatDisplay(entry.endDate)}</td>
                        <td>{formatDisplay(dateFromWorkIndex(entry.lateStart, state.calendar))}</td>
                        <td>{formatDisplay(dateFromWorkIndex(entry.lateFinish, state.calendar))}</td>
                        <td>{entry.slack}</td>
                        <td>
                          <span className={entry.critical ? 'badge critical' : 'badge'}>
                            {entry.critical ? 'Kritis' : 'Float'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Diagram PERT</h2>
            <p className="panel-sub">
              E = (O + 4M + P) / 6 dan Var = ((P − O) / 6)² untuk tiap tugas.
            </p>
          </div>
        </div>

        {noTasks ? (
          <p className="field-hint">Belum ada tugas untuk dianalisis.</p>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Durasi ekspektasi (μ)</span>
                <span className="stat-value">{formatDecimal(pertStats.mu)} hari</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Standar deviasi (σ)</span>
                <span className="stat-value">{formatDecimal(pertStats.sigma, 2)} hari</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Varians total</span>
                <span className="stat-value">{formatDecimal(pertStats.variance, 2)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Perkiraan selesai (μ ± 1σ)</span>
                <span className="stat-value">
                  {formatDisplay(pertStats.finishMu)} — {formatDisplay(pertStats.finishSigma)}
                </span>
              </div>
            </div>

            <div className="pert-diagram-wrap">
              <svg
                width={svgWidth}
                height={svgHeight}
                className="pert-diagram"
                role="img"
                aria-label="Diagram jaringan PERT"
              >
                <defs>
                  <marker
                    id="pert-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3 L0,6 z" fill="#475569" />
                  </marker>
                </defs>
                {edges.map((edge) => (
                  <g key={edge.id}>
                    <path
                      d={edge.path}
                      fill="none"
                      stroke="#475569"
                      strokeWidth={1.5}
                      markerEnd="url(#pert-arrow)"
                    />
                    <text
                      x={edge.labelX}
                      y={edge.labelY}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#64748b"
                    >
                      {edge.label}
                    </text>
                  </g>
                ))}
                {nodes.map((node) => {
                  const estimate = pertEstimate(node.task);
                  const entry = pertSchedule.entries[node.task.id];
                  const isCritical = entry?.critical ?? false;
                  return (
                    <g key={node.task.id}>
                      <rect
                        x={node.x}
                        y={node.y}
                        width={NODE_W}
                        height={NODE_H}
                        rx={10}
                        fill="#ffffff"
                        stroke={isCritical ? '#dc2626' : node.task.color}
                        strokeWidth={isCritical ? 2.5 : 1.5}
                      />
                      <rect
                        x={node.x}
                        y={node.y}
                        width={6}
                        height={NODE_H}
                        rx={3}
                        fill={node.task.color}
                      />
                      <text x={node.x + 16} y={node.y + 24} fontSize={12} fill="#0f172a">
                        {truncate(node.task.name, 20)}
                      </text>
                      <text x={node.x + 16} y={node.y + 44} fontSize={11} fill="#64748b">
                        {`E=${formatDecimal(estimate.expected)} hr  σ²=${formatDecimal(
                          estimate.variance,
                          2,
                        )}`}
                      </text>
                      {isCritical && (
                        <text x={node.x + NODE_W - 60} y={node.y + 16} fontSize={9} fill="#dc2626">
                          KRITIS
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tugas</th>
                    <th>O (optimis)</th>
                    <th>M (most likely)</th>
                    <th>P (pesimis)</th>
                    <th>E (ekspektasi)</th>
                    <th>Varian</th>
                  </tr>
                </thead>
                <tbody>
                  {state.tasks.map((task) => {
                    const estimate = pertEstimate(task);
                    return (
                      <tr key={task.id}>
                        <td>{task.name}</td>
                        <td>{estimate.optimistic}</td>
                        <td>{estimate.mostLikely}</td>
                        <td>{estimate.pessimistic}</td>
                        <td>{formatDecimal(estimate.expected)}</td>
                        <td>{formatDecimal(estimate.variance, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
