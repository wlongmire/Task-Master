import React, { useEffect, useMemo } from 'react';
import { getCategories, getArchivedCategories, getTasks, getEvents, getMeetings } from '../../db';

const STATE_ORDER  = ['inprogress', 'todo', 'backlog', 'completed'];
const STATE_LABELS = { inprogress: 'In Progress', todo: 'To Do', backlog: 'Backlog', completed: 'Done' };
const STATE_COLORS = { inprogress: 'var(--c-inprogress)', todo: 'var(--c-todo)', backlog: 'var(--c-backlog)', completed: 'var(--c-completed)' };

export default function TopicPopup({ topicId, onClose, tick, archived = false, onArchive, onRestore, onDelete }) {
  const cat      = useMemo(() => [...getCategories(), ...getArchivedCategories()].find(c => c.id === topicId), [topicId, tick]);
  const tasks    = useMemo(() => getTasks().filter(t => (archived ? t.archived : !t.archived) && t.categoryId === topicId), [topicId, tick, archived]);
  const gigs     = useMemo(() => getEvents().filter(e => !e.archived && e.categoryId === topicId).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')), [topicId, tick]);
  const meetings = useMemo(() => getMeetings().filter(m => !m.archived && m.categoryId === topicId).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')), [topicId, tick]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const tasksByState = STATE_ORDER
    .map(state => ({ state, items: tasks.filter(t => t.state === state) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', zIndex: 200,
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 8, width: 500, maxHeight: '72vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 17, fontWeight: 700, color: archived ? 'var(--text-dim)' : 'var(--text)', letterSpacing: '-0.01em' }}>
              {cat?.name || 'Topic'}
            </span>
            {archived && <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmer)' }}>archived</span>}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Pill count={tasks.length}    label="tasks"    color="var(--c-todo)" />
            <Pill count={gigs.length}     label="gigs"     color="var(--c-gigs)" />
            <Pill count={meetings.length} label="meetings" color="var(--c-inprogress)" />
          </div>
          {archived ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onRestore}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--c-completed)', background: 'none', border: '1px solid var(--c-completed)', borderRadius: 3, cursor: 'pointer', padding: '3px 8px' }}>
                ↩ Restore
              </button>
              <button onClick={onDelete}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', color: '#e05050', background: 'none', border: '1px solid #e05050', borderRadius: 3, cursor: 'pointer', padding: '3px 8px' }}>
                ✕ Delete
              </button>
            </div>
          ) : onArchive ? (
            <button onClick={onArchive}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-dimmer)', background: 'none', border: '1px solid var(--border2)', borderRadius: 3, cursor: 'pointer', padding: '3px 8px' }}>
              ⊡ Archive
            </button>
          ) : null}
          <button onClick={onClose} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-dimmer)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Tasks */}
          <Section title="Tasks">
            {tasksByState.length === 0
              ? <Empty>No tasks in this topic.</Empty>
              : tasksByState.map(({ state, items }) => (
                  <div key={state} style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: STATE_COLORS[state], marginBottom: 5 }}>
                      {STATE_LABELS[state]}
                    </div>
                    {items.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: t.state === 'completed' ? 'var(--text-dim)' : 'var(--text)', textDecoration: t.state === 'completed' ? 'line-through' : 'none', flex: 1 }}>{t.text || 'Untitled'}</span>
                        {t.urgent && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#e05050', border: '1px solid #e05050', borderRadius: 2, padding: '1px 4px' }}>!</span>}
                        {t.dueDate && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dimmer)' }}>{t.dueDate}</span>}
                      </div>
                    ))}
                  </div>
                ))
            }
          </Section>

          {/* Gigs */}
          <Section title="Gigs">
            {gigs.length === 0
              ? <Empty>No gigs in this topic.</Empty>
              : gigs.map(g => (
                  <EventRow key={g.id} name={g.name} date={g.date} done={g.done} color="var(--c-gigs)" />
                ))
            }
          </Section>

          {/* Meetings */}
          <Section title="Meetings">
            {meetings.length === 0
              ? <Empty>No meetings in this topic.</Empty>
              : meetings.map(m => (
                  <EventRow key={m.id} name={m.name} date={m.date} time={m.time} done={m.done} color="var(--c-inprogress)" />
                ))
            }
          </Section>
        </div>
      </div>
    </>
  );
}

function Pill({ count, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{count}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dimmer)' }}>{label}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-dimmer)', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function EventRow({ name, date, time, done, color }) {
  const d = new Date(date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = time ? new Date(`1970-01-01T${time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: done ? 'var(--text-dim)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', flex: 1 }}>{name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color, flexShrink: 0 }}>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dimmer)', padding: '6px 0' }}>{children}</div>;
}
