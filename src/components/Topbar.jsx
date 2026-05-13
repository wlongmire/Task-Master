import React, { useMemo, useEffect, useState } from 'react';
import { getTasks, getEvents, getGrateful, todayKey } from '../db';

const QUOTES = [
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'Your time is limited, so don\'t waste it living someone else\'s life.', author: 'Steve Jobs' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
];

function getDailyQuote() {
  const idx = new Date().getDate() % QUOTES.length;
  return QUOTES[idx];
}

function daysUntil(dateStr) {
  const today = new Date(todayKey() + 'T00:00:00');
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}

export default function Topbar({ viewDay, tick, openArchive }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = todayKey();
  const h = time.getHours();
  const period = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';

  const stats = useMemo(() => {
    const tasks = getTasks().filter(t => !t.archived);
    const grateful = getGrateful(today);
    const events = getEvents().filter(e => !e.archived);
    return {
      gratitudes: grateful.text ? grateful.text.split('\n').filter(l => l.trim()).length : 0,
      todo:       tasks.filter(t => t.state === 'todo').length,
      backlog:    tasks.filter(t => t.state === 'backlog').length,
      inprogress: tasks.filter(t => t.state === 'inprogress').length,
      completed:  tasks.filter(t => t.state === 'completed').length,
      gigs:       events.filter(e => !e.done).length,
    };
  }, [tick]);

  const nextGig = useMemo(() => {
    const events = getEvents().filter(e => !e.archived && !e.done && e.date >= today);
    return events.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }, [tick]);

  const quote = getDailyQuote();

  const dateLabel = (() => {
    if (viewDay === today) {
      return time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    const d = new Date(viewDay + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  return (
    <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
      {/* Row 1: greeting + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '9px 28px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Good {period}</span>
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>— {dateLabel}</span>
          {viewDay !== today && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-todo)', border: '1px solid var(--c-todo)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', opacity: 0.7 }}>viewing past</span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
          <Stat num={stats.gratitudes} label="Gratitudes" cls="grateful" />
          <Stat num={stats.todo}       label="To Do"      cls="todo" />
          <Stat num={stats.backlog}    label="Backlog"    cls="backlog" />
          <Stat num={stats.inprogress} label="In Progress" cls="inprogress" />
          <Stat num={stats.completed}  label="Done"       cls="completed" />
          <Stat num={stats.gigs}       label="Gigs"       cls="gigs" />
        </div>
      </div>

      {/* Row 2: quote + next gig */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '9px 28px' }}>
        <div style={{ fontFamily: 'var(--font-nb)', fontStyle: 'italic', fontSize: 13, color: 'var(--text-dim)', flex: 1, display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{quote.text}"</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-dimmer)', flexShrink: 0 }}>— {quote.author}</span>
        </div>
        {nextGig && <NextGigWidget gig={nextGig} today={today} />}
      </div>
    </header>
  );
}

function Stat({ num, label, cls }) {
  const colors = {
    grateful:   'var(--c-grateful)',
    todo:       'var(--c-todo)',
    backlog:    'var(--c-backlog)',
    inprogress: 'var(--c-inprogress)',
    completed:  'var(--c-completed)',
    gigs:       'var(--c-gigs)',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 18, fontWeight: 700, lineHeight: 1, color: colors[cls] }}>{num}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{label}</span>
    </div>
  );
}

function NextGigWidget({ gig, today }) {
  const diff = daysUntil(gig.date);
  const dateLabel = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `in ${diff}d`;
  const d = new Date(gig.date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-gigs)', boxShadow: diff <= 2 ? '0 0 0 3px oklch(28% 0.10 340 / 0.4)' : 'none' }} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Next Gig</span>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {gig.name}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>· {dateStr} · {dateLabel}</span>
        </span>
      </div>
    </div>
  );
}
