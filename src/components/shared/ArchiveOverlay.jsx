import React, { useMemo, useEffect, useState } from 'react';
import { getGratefulDays, getGrateful, getIntentionsDays, getIntentions, getReflectionDays, getReflection, getTasks, getEvents, getMeetings, formatDateShort, todayKey } from '../../db';

const TABS = ['activity', 'grateful', 'intentions', 'reflections', 'events'];

const TAB_LABELS = { activity: 'Activity', grateful: 'Grateful', intentions: 'Intentions', reflections: 'Reflection', events: 'Events' };

const EVENT_META = {
  created:  { label: 'Created',   color: 'var(--text-dimmer)' },
  started:  { label: 'Started',   color: 'var(--c-inprogress)' },
  progress: { label: 'Progress',  color: 'var(--c-inprogress)' },
  done:     { label: 'Completed', color: 'var(--c-completed)' },
  archived: { label: 'Archived',  color: 'var(--text-dimmer)' },
};

function buildActivityFeed(tasks) {
  const events = [];
  tasks.forEach(task => {
    (task.log || []).forEach(entry => {
      events.push({ id: entry.id, type: entry.type, taskText: task.text, note: entry.note, ts: entry.loggedAt, fullLog: task.log });
    });
    if (task.archived && task.archivedAt) {
      events.push({ id: task.id + '-arc', type: 'archived', taskText: task.text, note: null, ts: task.archivedAt, fullLog: task.log });
    }
  });
  const byDay = {};
  events.forEach(e => {
    const d = new Date(e.ts);
    const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!byDay[dk]) byDay[dk] = [];
    byDay[dk].push(e);
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dk, evts]) => [dk, [...evts].sort((a, b) => b.ts - a.ts)]);
}

function dayHeader(dk) {
  const today = todayKey();
  const yesterday = new Date(today + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yk = yesterday.toISOString().slice(0, 10);
  const d = new Date(dk + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  if (dk === today) return `Today — ${label}`;
  if (dk === yk)    return `Yesterday — ${label}`;
  return label;
}

export default function ArchiveOverlay({ open, tab, setTab, onClose, tick }) {
  const [expandedItems, setExpandedItems] = useState(new Set());
  const toggleExpand = (id) => setExpandedItems(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const idx = TABS.indexOf(tab);
        if (e.key === 'ArrowLeft')  setTab(TABS[Math.max(0, idx - 1)]);
        if (e.key === 'ArrowRight') setTab(TABS[Math.min(TABS.length - 1, idx + 1)]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, tab, setTab, onClose]);

  const activityFeed = useMemo(() => buildActivityFeed(getTasks()), [tick]);

  const completedEvents = useMemo(() => {
    const gigs = getEvents()
      .filter(e => e.done || e.archived)
      .map(e => ({ ...e, kind: 'gig' }));
    const meetings = getMeetings()
      .filter(m => m.done || m.archived)
      .map(m => ({ ...m, kind: 'meeting' }));
    return [...gigs, ...meetings].sort((a, b) => b.date.localeCompare(a.date));
  }, [tick]);

  if (!open) return null;

  let content;

  if (tab === 'activity') {
    content = activityFeed.length === 0
      ? <div className="archive-empty">No activity yet.</div>
      : activityFeed.map(([dk, events]) => (
          <div key={dk} style={{ marginBottom: 24 }}>
            <div className="archive-group-label">{dayHeader(dk)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {events.map(e => {
                const meta = EVENT_META[e.type] || { label: e.type, color: 'var(--text-dimmer)' };
                const timeStr = new Date(e.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const isDone = e.type === 'done';
                const isExpanded = expandedItems.has(e.id);
                const sortedLog = isDone && e.fullLog
                  ? [...e.fullLog].sort((a, b) => b.loggedAt - a.loggedAt)
                  : [];
                return (
                  <div key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {/* Main row */}
                    <div
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0', cursor: isDone ? 'pointer' : 'default' }}
                      onClick={isDone ? () => toggleExpand(e.id) : undefined}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dimmer)', flexShrink: 0, width: 52, paddingTop: 2 }}>{timeStr}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: meta.color, flexShrink: 0, width: 62, paddingTop: 2 }}>{meta.label}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.taskText || 'Untitled'}</span>
                          {isDone && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dimmer)', flexShrink: 0 }}>{isExpanded ? '▴' : '▾'}</span>}
                        </div>
                        {e.note && (
                          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{e.note}</div>
                        )}
                      </div>
                    </div>
                    {/* Expanded log */}
                    {isDone && isExpanded && sortedLog.length > 0 && (
                      <div style={{ marginLeft: 114, marginBottom: 6, borderLeft: '2px solid var(--border)', paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {sortedLog.map(entry => {
                          const entryMeta = EVENT_META[entry.type] || { label: entry.type, color: 'var(--text-dimmer)' };
                          const entryTime = new Date(entry.loggedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                          return (
                            <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '3px 0' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dimmer)', flexShrink: 0 }}>{entryTime}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: entryMeta.color, flexShrink: 0 }}>{entryMeta.label}</span>
                              </div>
                              {entry.note && (
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-dim)', paddingLeft: 0 }}>{entry.note}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ));

  } else if (tab === 'grateful') {
    const days = getGratefulDays();
    content = days.length === 0
      ? <div className="archive-empty">No gratitude entries yet.</div>
      : days.map(dk => {
          const entry = getGrateful(dk);
          if (!entry.text) return null;
          return (
            <div key={dk}>
              <div className="archive-group-label">{formatDateShort(dk)}</div>
              <div className="archive-entry">{entry.text}</div>
            </div>
          );
        });

  } else if (tab === 'intentions') {
    const days = getIntentionsDays();
    content = days.length === 0
      ? <div className="archive-empty">No intention entries yet.</div>
      : days.map(dk => {
          const entry = getIntentions(dk);
          if (!entry.text) return null;
          return (
            <div key={dk}>
              <div className="archive-group-label">{formatDateShort(dk)}</div>
              <div className="archive-entry">{entry.text}</div>
            </div>
          );
        });

  } else if (tab === 'reflections') {
    const days = getReflectionDays();
    content = days.length === 0
      ? <div className="archive-empty">No reflection entries yet.</div>
      : days.map(dk => {
          const entry = getReflection(dk);
          if (!entry.text) return null;
          return (
            <div key={dk}>
              <div className="archive-group-label">{formatDateShort(dk)}</div>
              <div className="archive-entry">{entry.text}</div>
            </div>
          );
        });

  } else if (tab === 'events') {
    content = completedEvents.length === 0
      ? <div className="archive-empty">No completed gigs or meetings yet.</div>
      : completedEvents.map(item => {
          const d = new Date(item.date + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
          const timeStr = item.time
            ? new Date(`1970-01-01T${item.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : null;
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: item.kind === 'gig' ? 'var(--c-gigs)' : 'var(--c-inprogress)', flexShrink: 0, width: 52 }}>{item.kind}</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: item.archived ? 'var(--text-dim)' : 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: item.done ? 'line-through' : 'none' }}>{item.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dimmer)', flexShrink: 0 }}>
                {dateStr}{timeStr ? ` · ${timeStr}` : ''}
              </span>
              {item.archived && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dimmer)', flexShrink: 0 }}>archived</span>}
            </div>
          );
        });
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />
      <div className="archive-overlay open">
        <div className="archive-hd">
          <div className="archive-title">Daily Activity</div>
          <div className="archive-close" onClick={onClose}>✕ Close</div>
        </div>
        <div className="archive-tabs">
          {TABS.map(t => (
            <div key={t} className={`archive-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </div>
          ))}
        </div>
        <div className="archive-body">{content}</div>
      </div>
    </>
  );
}
