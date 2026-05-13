import React, { useState, useMemo } from 'react';
import { getTasks, getGrateful, getEvents, dateKey, todayKey } from '../../db';

export default function MiniCalendar({ viewDay, setViewDay, tick }) {
  const today = todayKey();
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(today + 'T00:00:00');
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const dots = useMemo(() => {
    const map = {};
    const tasks = getTasks().filter(t => !t.archived);
    tasks.forEach(t => {
      if (t.dayKey) { if (!map[t.dayKey]) map[t.dayKey] = new Set(); map[t.dayKey].add('todo'); }
      if (t.state === 'completed' && t.dateCompleted) {
        const dk = dateKey(new Date(t.dateCompleted));
        if (!map[dk]) map[dk] = new Set(); map[dk].add('completed');
      }
    });
    getEvents().filter(e => !e.archived).forEach(e => {
      if (e.date) { if (!map[e.date]) map[e.date] = new Set(); map[e.date].add('gigs'); }
    });
    // grateful dots
    const tasks2 = getTasks(); // reuse
    const gratKeys = Object.keys(JSON.parse(localStorage.getItem('taskmaster_data') || '{}').grateful || {});
    gratKeys.forEach(dk => { if (!map[dk]) map[dk] = new Set(); map[dk].add('grateful'); });
    return map;
  }, [tick]);

  const { year, month } = calMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: prevDays - firstDay + 1 + i, other: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, other: false });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - firstDay + 1, other: true });

  const DOT_COLORS = { grateful: 'var(--c-grateful)', todo: 'var(--c-todo)', completed: 'var(--c-completed)', gigs: 'var(--c-gigs)' };

  return (
    <div style={{ margin: '0 10px 8px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)', padding: '7px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', color: '#8a8680' }}>{monthLabel}</span>
        <div style={{ display: 'flex', gap: 1 }}>
          {[['‹', -1], ['›', 1]].map(([ch, dir]) => (
            <button key={dir} onClick={() => setCalMonth(m => {
              let mo = m.month + dir, yr = m.year;
              if (mo < 0) { mo = 11; yr--; } if (mo > 11) { mo = 0; yr++; }
              return { year: yr, month: mo };
            })} style={{ width: 16, height: 16, display: 'grid', placeItems: 'center', fontSize: 10, color: '#6a6660', cursor: 'pointer', borderRadius: 2, border: 'none', background: 'none' }}>{ch}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 7, textAlign: 'center', color: '#555250', paddingBottom: 3 }}>{d}</div>
        ))}
        {cells.map((cell, i) => {
          const dk = !cell.other ? `${year}-${String(month + 1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}` : null;
          const isToday = dk === today;
          const isSel = dk === viewDay && dk !== today;
          const cellDots = dk ? [...(dots[dk] || [])] : [];
          return (
            <div key={i} onClick={() => dk && setViewDay(dk)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, textAlign: 'center',
                padding: '4px 1px 2px', borderRadius: 3, lineHeight: 1,
                color: cell.other ? '#2a2a28' : isToday ? 'var(--text)' : '#8a8680',
                cursor: dk ? 'pointer' : 'default', minHeight: 22, position: 'relative',
                background: isToday ? 'var(--surface3)' : 'transparent',
                boxShadow: isToday ? 'inset 0 0 0 1px var(--c-todo)' : isSel ? 'inset 0 0 0 1px var(--c-todo)' : 'none',
                fontWeight: isToday ? 600 : 400,
              }}>
              {cell.day}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2, minHeight: 4 }}>
                {cellDots.slice(0, 3).map(type => (
                  <div key={type} style={{ width: 3, height: 3, borderRadius: '50%', background: DOT_COLORS[type] }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
