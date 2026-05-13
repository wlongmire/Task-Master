import React, { useState, useMemo } from 'react';
import Outliner from '../shared/Outliner';
import { getTasks, restoreTask, archiveTask, todayKey } from '../../db';

export default function ActivePage({ viewDay, refresh, tick, openLogPopup }) {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Active</div>
        <div className="page-subtitle">· in flight + finished</div>
      </div>
      <div className="page-grid">
        <section className="section">
          <div className="section-hd">
            <span className="section-title inprogress">In Progress</span>
            <span className="section-sub">· ongoing</span>
          </div>
          <Outliner
            key={`inprogress-${tick}`}
            listState="inprogress"
            viewDay={viewDay}
            refresh={refresh}
            openLogPopup={openLogPopup}
          />
        </section>

        <section className="section">
          <div className="section-hd">
            <span className="section-title completed">Completed</span>
          </div>
          <CompletedList tick={tick} refresh={refresh} viewDay={viewDay} />
        </section>
      </div>
    </div>
  );
}

function CompletedList({ tick, refresh, viewDay }) {
  const [expandedGroups, setExpandedGroups] = useState(new Set(['today', 'yesterday']));
  const today = todayKey();

  const grouped = useMemo(() => {
    const tasks = getTasks().filter(t => !t.archived && t.state === 'completed');
    const byDay = {};
    tasks.forEach(t => {
      const d = t.dateCompleted ? new Date(t.dateCompleted) : new Date();
      const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!byDay[dk]) byDay[dk] = [];
      byDay[dk].push(t);
    });
    return Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));
  }, [tick]);

  const toggleGroup = (dk) => setExpandedGroups(s => {
    const n = new Set(s); n.has(dk) ? n.delete(dk) : n.add(dk); return n;
  });

  const dayLabel = (dk) => {
    if (dk === today) return `Today — ${new Date(dk + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const yesterday = new Date(today + 'T00:00:00'); yesterday.setDate(yesterday.getDate() - 1);
    const yk = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    if (dk === yk) return `Yesterday — ${new Date(dk + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return new Date(dk + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (grouped.length === 0) {
    return (
      <div className="completed-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)' }}>Nothing completed yet.</span>
      </div>
    );
  }

  return (
    <div className="completed-card">
      {grouped.map(([dk, tasks]) => {
        const isRecent = dk === today || grouped.indexOf(grouped.find(g => g[0] === dk)) <= 1;
        const isExpanded = expandedGroups.has(dk) || isRecent;
        return (
          <div key={dk}>
            <div className="comp-date"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => toggleGroup(dk)}>
              {dayLabel(dk)}
              {!isExpanded && <span style={{ color: 'var(--text-dimmer)', marginLeft: 4 }}>{tasks.length} items ▸</span>}
            </div>
            {isExpanded && tasks.map(task => (
              <CompletedItem key={task.id} task={task} refresh={refresh} viewDay={viewDay} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CompletedItem({ task, refresh, viewDay }) {
  const lastLog = task.log && task.log.length > 0 ? task.log[task.log.length - 1] : null;
  const timeStr = task.dateCompleted
    ? new Date(task.dateCompleted).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <div className="comp-item">
      <div className="comp-check" />
      <div className="comp-title">{task.text}</div>
      {lastLog?.note && <div className="comp-meta" style={{ flex: 1 }}>{lastLog.note}</div>}
      <div className="comp-meta">{timeStr}</div>
      <div className="comp-actions">
        <button className="comp-act" onClick={() => { restoreTask(task.id, viewDay); refresh(); }}>↩ Restore</button>
        <button className="comp-act" onClick={() => { archiveTask(task.id); refresh(); }}>Archive</button>
      </div>
    </div>
  );
}
