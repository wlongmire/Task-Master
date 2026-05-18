import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { getTasks, getEvents, getMeetings, todayKey } from '../db';

const TAROT = [
  { name: 'The Fool',         meaning: 'New beginnings — leap before you look.' },
  { name: 'The Magician',     meaning: 'All the tools you need are already in hand.' },
  { name: 'The High Priestess', meaning: 'Trust the quiet knowing beneath the noise.' },
  { name: 'The Empress',      meaning: 'Abundance flows when you create freely.' },
  { name: 'The Emperor',      meaning: 'Steady structure brings lasting results.' },
  { name: 'The Hierophant',   meaning: 'Seek guidance; respect what has endured.' },
  { name: 'The Lovers',       meaning: 'Alignment — choose what reflects your values.' },
  { name: 'The Chariot',      meaning: 'Push forward; will and focus win today.' },
  { name: 'Strength',         meaning: 'Gentle persistence outlasts brute force.' },
  { name: 'The Hermit',       meaning: 'Step back; the answer comes in solitude.' },
  { name: 'Wheel of Fortune', meaning: 'A cycle turns — ride it, don\'t resist it.' },
  { name: 'Justice',          meaning: 'Truth and accountability clear the path.' },
  { name: 'The Hanged Man',   meaning: 'Pause and see the problem from another angle.' },
  { name: 'Death',            meaning: 'Something ends so something better can begin.' },
  { name: 'Temperance',       meaning: 'Balance and patience compound quietly.' },
  { name: 'The Devil',        meaning: 'Name what binds you — awareness breaks chains.' },
  { name: 'The Tower',        meaning: 'What crumbles was already unstable.' },
  { name: 'The Star',         meaning: 'After the storm, hope and renewal.' },
  { name: 'The Moon',         meaning: 'Not everything is as it appears — look closer.' },
  { name: 'The Sun',          meaning: 'Clarity, energy, and well-earned confidence.' },
  { name: 'Judgement',        meaning: 'Honest reflection leads to a fresh start.' },
  { name: 'The World',        meaning: 'You\'ve come full circle — celebrate it.' },
];

function getDailyTarot() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return TAROT[dayIndex % TAROT.length];
}

const QUOTES = [
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: "It always seems impossible until it's done.", author: 'Nelson Mandela' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: 'Steve Jobs' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
];

function getDailyQuote() {
  const idx = new Date().getDate() % QUOTES.length;
  return QUOTES[idx];
}

function dueSub(dateStr, today) {
  const diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (diff === 0)  return 'today';
  if (diff === 1)  return 'tomorrow';
  if (diff > 0)   return `in ${diff}d`;
  if (diff === -1) return 'yesterday';
  return `${Math.abs(diff)}d overdue`;
}

const NAME = 'Warren';

export default function Topbar({ viewDay, tick }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = todayKey();
  const h = time.getHours();
  const period = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

  const stats = useMemo(() => {
    const tasks = getTasks().filter(t => !t.archived);
    const dayStart = new Date(viewDay + 'T00:00:00').getTime();
    const dayEnd   = dayStart + 86400000;

    const created = tasks.filter(t =>
      t.dateCreated != null &&
      t.dateCreated >= dayStart &&
      t.dateCreated <  dayEnd
    ).length;

    const partial = tasks.filter(t =>
      (t.log || []).some(e => e.type === 'progress' && e.loggedAt >= dayStart && e.loggedAt < dayEnd)
    ).length;

    const done = tasks.filter(t =>
      t.dateCompleted != null &&
      t.dateCompleted >= dayStart &&
      t.dateCompleted <  dayEnd
    ).length;

    const active = tasks.filter(t => t.state !== 'completed');

    const nextDeadline = active
      .filter(t => t.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;

    const meetingsAhead = getMeetings().filter(m => !m.archived && !m.done && m.date === today).length;

    return { created, partial, done, nextDeadline, meetingsAhead };
  }, [tick, viewDay]);

  const nextGig = useMemo(() => {
    const events = getEvents().filter(e => !e.archived && !e.done && e.date >= today);
    return events.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }, [tick]);

  const nextMeeting = useMemo(() => {
    const meetings = getMeetings().filter(m => !m.archived && !m.done && m.date >= today);
    return meetings.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))[0] || null;
  }, [tick]);

  const quote = getDailyQuote();
  const tarot = getDailyTarot();

  const dateLabel = (() => {
    if (viewDay === today) return time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return new Date(viewDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  return (
    <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
      {/* Row 1: greeting + time + task widgets */}
      <div className="topbar-row" style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '9px 28px', borderBottom: '1px solid var(--border)' }}>
        <div className="topbar-greeting" style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--c-todo)' }}>Good {period}, {NAME}</span>
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>— {dateLabel}</span>
          <span className="topbar-time" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)', fontWeight: 400, letterSpacing: '0.04em' }}>{timeStr}</span>
          {viewDay < today && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-todo)', border: '1px solid var(--c-todo)', borderRadius: 3, padding: '1px 6px', opacity: 0.7 }}>viewing past</span>
          )}
          {viewDay > today && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-inprogress)', border: '1px solid var(--c-inprogress)', borderRadius: 3, padding: '1px 6px', opacity: 0.7 }}>viewing future</span>
          )}
        </div>
        <div className="hide-mobile" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <TaskWidget
            label="Next Deadline"
            name={stats.nextDeadline?.text}
            sub={stats.nextDeadline ? dueSub(stats.nextDeadline.dueDate, today) : null}
            color="var(--c-todo)"
          />
          <StatDivider />
          <TaskWidget
            label="Next Gig"
            name={nextGig?.name}
            sub={nextGig ? dueSub(nextGig.date, today) : null}
            color="var(--c-gigs)"
            dot={nextGig ? Math.round((new Date(nextGig.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) <= 2 : false}
          />
          <StatDivider />
          <TaskWidget
            label="Next Meeting"
            name={nextMeeting?.name}
            sub={nextMeeting ? dueSub(nextMeeting.date, today) : null}
            color="var(--c-inprogress)"
            dot={nextMeeting ? Math.round((new Date(nextMeeting.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) <= 2 : false}
          />
        </div>
      </div>

      {/* Row 2: quote + counts */}
      <div className="topbar-row" style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '9px 28px' }}>
        <div className="hide-mobile" style={{ fontFamily: 'var(--font-nb)', fontStyle: 'italic', fontSize: 13, color: 'var(--text-dim)', flex: 1, display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{quote.text}"</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-dimmer)', flexShrink: 0 }}>— {quote.author}</span>
        </div>
        <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <StatDivider />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dimmer)', flexShrink: 0 }}>✦ {tarot.name}</span>
            <span style={{ fontFamily: 'var(--font-nb)', fontStyle: 'italic', fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{tarot.meaning}</span>
          </div>
        </div>
        <div className="show-mobile" style={{ display: 'none', alignItems: 'center', gap: 20, flex: 1 }}>
          <TaskWidget
            label="Next Deadline"
            name={stats.nextDeadline?.text}
            sub={stats.nextDeadline ? dueSub(stats.nextDeadline.dueDate, today) : null}
            color="var(--c-todo)"
          />
          <StatDivider />
          <TaskWidget
            label="Next Meeting"
            name={nextMeeting?.name}
            sub={nextMeeting ? dueSub(nextMeeting.date, today) : null}
            color="var(--c-inprogress)"
            dot={nextMeeting ? Math.round((new Date(nextMeeting.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) <= 2 : false}
          />
        </div>
        <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          <Stat num={stats.created}           label="Created"  cls="created" />
          <StatDivider />
          <Stat num={stats.partial}           label="Partial"  cls="inprogress" />
          <StatDivider />
          <Stat num={stats.done}              label="Done"     cls="completed" />
          <StatDivider />
          <Stat num={stats.meetingsAhead} label="Meetings" cls="meetings" />
        </div>
      </div>
    </header>
  );
}

function Stat({ num, label, cls }) {
  const colors = { created: 'var(--text-dim)', inprogress: 'var(--c-inprogress)', completed: 'var(--c-completed)', gigs: 'var(--c-gigs)', meetings: 'var(--c-inprogress)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700, lineHeight: 1, color: colors[cls] ?? 'var(--text)' }}>{num}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>{label}</span>
    </div>
  );
}

function StatDivider() {
  return <div style={{ width: 1, height: 28, background: 'var(--border2)', flexShrink: 0 }} />;
}

function TaskWidget({ label, name, sub, color, dot }) {
  const scrollRef = useRef();
  const rafRef    = useRef();

  const startScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const duration = 800 + max * 18;
    let t0 = null;
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      el.scrollLeft = e * max;
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const stopScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, maxWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {dot && <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 0 2px ${color}44`, flexShrink: 0 }} />}
        <span className="tw-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>{label}</span>
      </div>
      {name ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
          <div
            ref={scrollRef}
            onMouseEnter={startScroll}
            onMouseLeave={stopScroll}
            style={{ overflow: 'hidden', maxWidth: 110, flexShrink: 0 }}
          >
            <span className="tw-name" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', display: 'block' }}>
              {name}
            </span>
          </div>
          {sub && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color, flexShrink: 0, whiteSpace: 'nowrap' }}>· {sub}</span>
          )}
        </div>
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dimmer)' }}>—</span>
      )}
    </div>
  );
}
