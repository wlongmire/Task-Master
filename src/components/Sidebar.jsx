import React, { useMemo } from 'react';
import MiniCalendar from './shared/MiniCalendar';
import { getTasks, getEvents, todayKey, offsetDate, exportData } from '../db';

const PAGES = [
  { id: 'daily',  label: 'Daily',      color: 'var(--c-grateful)' },
  { id: 'todo',   label: 'To Do',      color: 'var(--c-todo)' },
  { id: 'active', label: 'Active',     color: 'var(--c-inprogress)' },
  { id: 'gigs',   label: 'Gigs',       color: 'var(--c-gigs)' },
];

export default function Sidebar({ page, setPage, viewDay, setViewDay, tick }) {
  const today = todayKey();

  const counts = useMemo(() => {
    const tasks = getTasks().filter(t => !t.archived);
    const events = getEvents().filter(e => !e.archived);
    return {
      todo:       tasks.filter(t => t.state === 'todo').length,
      backlog:    tasks.filter(t => t.state === 'backlog').length,
      inprogress: tasks.filter(t => t.state === 'inprogress').length,
      gigs:       events.filter(e => !e.done).length,
    };
  }, [tick]);

  const pageCounts = {
    todo:   counts.todo + counts.backlog,
    active: counts.inprogress,
    gigs:   counts.gigs,
  };

  const prevDay = () => setViewDay(d => offsetDate(d, -1));
  const nextDay = () => { if (viewDay < today) setViewDay(d => offsetDate(d, 1)); };

  const formatDayLabel = (dk) => {
    if (dk === today) return 'Today';
    const d = new Date(dk + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0,
      width: 'var(--sidebar-w)', height: '100vh',
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 10,
    }}>
      <div style={{ padding: '18px 16px 4px', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6a6660' }}>
        Task Master
      </div>

      {/* Day nav */}
      <div style={{ padding: '3px 12px 10px', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
        <button onClick={prevDay} style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', fontSize: 13, color: '#6a6660', cursor: 'pointer', borderRadius: 3, border: '1px solid transparent', background: 'none' }}
          onMouseEnter={e => e.target.style.background = 'var(--surface2)'}
          onMouseLeave={e => e.target.style.background = 'none'}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>{formatDayLabel(viewDay)}</div>
        <button onClick={nextDay} disabled={viewDay >= today}
          style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', fontSize: 13, color: viewDay >= today ? '#333' : '#6a6660', cursor: viewDay >= today ? 'default' : 'pointer', borderRadius: 3, border: '1px solid transparent', background: 'none' }}
          onMouseEnter={e => { if (viewDay < today) e.target.style.background = 'var(--surface2)'; }}
          onMouseLeave={e => e.target.style.background = 'none'}>›</button>
      </div>

      <MiniCalendar viewDay={viewDay} setViewDay={setViewDay} tick={tick} />

      {/* Nav */}
      <div style={{ padding: '12px 16px 4px', fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#666360', fontWeight: 500, borderTop: '1px solid var(--border)', marginTop: 4 }}>
        Pages
      </div>
      {PAGES.map(p => (
        <NavItem
          key={p.id}
          label={p.label}
          color={p.color}
          active={page === p.id}
          count={pageCounts[p.id]}
          onClick={() => setPage(p.id)}
        />
      ))}

      <div style={{ marginTop: 'auto', padding: '10px 16px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FooterBtn onClick={() => {}}>⊡ Archive</FooterBtn>
        <FooterBtn onClick={exportData}>⬇ Export Data</FooterBtn>
      </div>
    </aside>
  );
}

function FooterBtn({ onClick, children }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: hovered ? 'var(--text)' : '#8a8680', cursor: 'pointer', padding: '4px 0', background: 'none', border: 'none', textAlign: 'left', transition: 'color 0.1s' }}>
      {children}
    </button>
  );
}

function NavItem({ label, color, active, count, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '6px 16px', cursor: 'pointer',
      fontFamily: 'var(--font-ui)', fontSize: 13,
      color: active ? 'var(--text)' : '#b5b1a8',
      borderLeft: `2px solid ${active ? color : 'transparent'}`,
      background: active ? 'var(--surface2)' : 'transparent',
      fontWeight: active ? 600 : 400,
      borderTop: 'none', borderRight: 'none', borderBottom: 'none',
      borderLeft: `2px solid ${active ? color : 'transparent'}`,
      width: '100%', textAlign: 'left', transition: 'all 0.1s',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: active ? color : '#44423e' }} />
      {label}
      {count ? <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: active ? 'var(--text)' : '#6a6660' }}>{count}</span> : null}
    </button>
  );
}
