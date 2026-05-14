import React, { useState, useMemo } from 'react';
import Outliner from '../shared/Outliner';
import { getTasks, restoreTask, archiveTask, todayKey } from '../../db';

export default function ActivePage({ viewDay, refresh, tick, openArchive, openLogPopup, onPageEnd, onPageStart }) {
  return (
    <div className="page">
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
            onEnd={() => onPageEnd?.()}
            onStart={() => onPageStart?.()}
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
    const tasks = getTasks().filter(t => !t.archived);
    const byDay = {};

    // Fully completed tasks — one entry per task, keyed by completion date
    tasks.filter(t => t.state === 'completed').forEach(t => {
      const d = t.dateCompleted ? new Date(t.dateCompleted) : new Date();
      const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!byDay[dk]) byDay[dk] = [];
      byDay[dk].push({ kind: 'completed', task: t });
    });

    // In-progress tasks — one entry per 'progress' log entry, keyed by log date
    tasks.filter(t => t.state === 'inprogress').forEach(t => {
      (t.log || []).filter(e => e.type === 'progress').forEach(entry => {
        const d = new Date(entry.loggedAt);
        const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (!byDay[dk]) byDay[dk] = [];
        byDay[dk].push({ kind: 'progress', task: t, entry });
      });
    });

    // Sort each day's entries by timestamp descending (most recent first)
    Object.values(byDay).forEach(entries => {
      entries.sort((a, b) => {
        const aTime = a.kind === 'completed' ? (a.task.dateCompleted || 0) : a.entry.loggedAt;
        const bTime = b.kind === 'completed' ? (b.task.dateCompleted || 0) : b.entry.loggedAt;
        return bTime - aTime;
      });
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
            {isExpanded && tasks.map(item =>
              item.kind === 'completed'
                ? <CompletedItem key={item.task.id} task={item.task} refresh={refresh} viewDay={viewDay} />
                : <ProgressItem key={item.entry.id} task={item.task} entry={item.entry} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const LOG_TYPE_COLOR = {
  created:  'var(--text-dimmer)',
  started:  'var(--c-backlog)',
  progress: 'var(--c-inprogress)',
  done:     'var(--c-completed)',
};
const LOG_TYPE_LABEL = {
  created:  'created',
  started:  'started',
  progress: 'progress',
  done:     'done',
};

function CompletedItem({ task, refresh, viewDay }) {
  const [expanded, setExpanded] = useState(false);
  const log = task.log ? [...task.log].reverse() : [];
  const hasLog = log.length > 0;
  const doneEntry = log.find(e => e.type === 'done');
  const timeStr = task.dateCompleted
    ? new Date(task.dateCompleted).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <div className="comp-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
      <div onClick={() => hasLog && setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: hasLog ? 'pointer' : 'default' }}>
        <div className="comp-check" style={{ flexShrink: 0 }} />
        <div className="comp-title" style={{ flex: 1 }}>{task.text}</div>
        <div className="comp-meta" style={{ flexShrink: 0 }}>{timeStr}</div>
        {hasLog && <div style={{ fontSize: 10, color: 'var(--text-dimmer)', flexShrink: 0 }}>{expanded ? '▾' : '▸'}</div>}
        <div className="comp-actions" style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="comp-act" onClick={() => { restoreTask(task.id, viewDay); refresh(); }}>↩ Restore</button>
          <button className="comp-act" onClick={() => { archiveTask(task.id); refresh(); }}>Archive</button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginLeft: 22, marginTop: 6, marginBottom: 4, borderLeft: '2px solid var(--border2)', paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {log.map(entry => (
            <div key={entry.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', color: LOG_TYPE_COLOR[entry.type] || 'var(--text-dimmer)', flexShrink: 0, textTransform: 'uppercase' }}>
                {LOG_TYPE_LABEL[entry.type] || entry.type}
              </span>
              {entry.note && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-dim)' }}>{entry.note}</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dimmer)', marginLeft: 'auto', flexShrink: 0 }}>
                {new Date(entry.loggedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressItem({ task, entry }) {
  const timeStr = new Date(entry.loggedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="comp-item" style={{ gap: 8 }}>
      <div style={{
        width: 13, height: 13, flexShrink: 0, borderRadius: 3,
        border: '1.5px solid var(--c-inprogress)', background: 'transparent',
        display: 'grid', placeItems: 'center',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 1, background: 'var(--c-inprogress)' }} />
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-dim)', flex: 1 }}>{task.text}</div>
      {entry.note && (
        <div className="comp-meta" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.note}
        </div>
      )}
      <div className="comp-meta" style={{ flexShrink: 0 }}>{timeStr}</div>
    </div>
  );
}
