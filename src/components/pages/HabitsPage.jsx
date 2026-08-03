import React, { useState, useMemo, useEffect } from 'react';
import { getHabits, addHabit, updateHabit, setHabitDone, clearHabitDone, archiveHabit, habitStreak, habitPeriodProgress, getCategories, todayKey } from '../../db';

const PERIOD_ABBR = { weekly: 'wk', monthly: 'mo' };
const STREAK_UNIT = { daily: 'day', weekly: 'week', monthly: 'month' };

function scheduleLabel(schedule) {
  const s = schedule || { type: 'daily' };
  if (s.type === 'weekly')  return `${s.target || 1}×/week`;
  if (s.type === 'monthly') return `${s.target || 1}×/month`;
  return 'Daily';
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 600);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
}

export default function HabitsPage({ viewDay, refresh, tick, openLogPopup }) {
  const today = todayKey();
  const day = viewDay || today;           // check-ins apply to the viewed day
  const isToday = day === today;
  const isMobile = useIsMobile();
  const [adding, setAdding] = useState(false);

  const habits = useMemo(() => getHabits(), [tick]);
  const categories = useMemo(() => getCategories(), [tick]);

  const doneList = useMemo(
    () => habits.filter(h => h.completions?.[day])
      .sort((a, b) => (b.completions[day].completedAt || 0) - (a.completions[day].completedAt || 0)),
    [habits, day],
  );
  const doneCount = doneList.length;
  const total = habits.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const itemProps = { day, today, categories, refresh, openLogPopup };
  const emptyNote = txt => <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)', padding: '20px 0' }}>{txt}</div>;

  const habitsCol = (
    <section className="section" id="section-habits-list">
      <div className="section-hd">
        <span className="section-title habits">Habits</span>
        <button className="btn primary" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px', background: 'var(--c-habits)', borderColor: 'var(--c-habits)' }} onClick={() => setAdding(a => !a)}>+ New Habit</button>
      </div>
      {adding && <HabitAddForm categories={categories} refresh={refresh} onClose={() => setAdding(false)} />}
      <div className="habit-list">
        {habits.map(h => <HabitRow key={h.id} habit={h} {...itemProps} />)}
        {total === 0 && !adding && emptyNote('No habits yet. Add one to start a streak.')}
      </div>
    </section>
  );

  const doneCol = (
    <section className="section" id="section-habits-done">
      <div className="section-hd">
        <span className="section-title completed">Completed{isToday ? ' today' : ''}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)' }}>{doneCount}</span>
      </div>
      <div className="habit-list">
        {doneList.map(h => <HabitDone key={h.id} habit={h} day={day} />)}
        {doneCount === 0 && emptyNote(isToday ? 'Nothing checked off yet.' : 'Nothing was checked off this day.')}
      </div>
    </section>
  );

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{doneCount} / {total}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-dimmer)' }}>{isToday ? 'done today' : 'done this day'}</span>
        <div className="habit-progress-track"><div className="habit-progress-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      {isMobile ? (
        <div className="habits-grid">{habitsCol}{doneCol}</div>
      ) : (
        <div className="habits-grid">{habitsCol}{doneCol}</div>
      )}
    </div>
  );
}

function HabitRow({ habit, day, today, categories, refresh, openLogPopup }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <HabitEditForm habit={habit} categories={categories} refresh={refresh} onClose={() => setEditing(false)} />;

  const done = !!habit.completions?.[day];
  const streak = habitStreak(habit, today);
  const prog = habitPeriodProgress(habit, today);
  const periodic = prog.type !== 'daily';
  const met = prog.count >= prog.target;
  const cat = habit.categoryId ? (categories || []).find(c => c.id === habit.categoryId) : null;

  const toggle = () => {
    if (done) { clearHabitDone(habit.id, day); refresh(); }
    else openLogPopup(null, 'done', note => { setHabitDone(habit.id, day, note || null); refresh(); }, habit.text);
  };

  const archive = () => {
    if (window.confirm(`Archive "${habit.text}"? Its streak history is kept.`)) { archiveHabit(habit.id); refresh(); }
  };

  return (
    <div className="habit-row">
      <button className={`habit-check${done ? ' done' : ''}`} onClick={toggle} aria-label={done ? 'Mark not done' : 'Mark done'} />
      <div className="habit-body" onClick={toggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`habit-name${done ? ' done' : ''}`}>{habit.text}</span>
          {cat && <span className="habit-tag">{cat.name}</span>}
        </div>
      </div>
      {periodic && (
        <span className={`habit-prog${met ? ' met' : ''}`} title={`${prog.count} of ${prog.target} this ${STREAK_UNIT[prog.type]}`}>
          {prog.count}/{prog.target} {PERIOD_ABBR[prog.type]}
        </span>
      )}
      <span className={`habit-streak${streak > 0 ? ' alive' : ''}`} title={`${streak}-${STREAK_UNIT[prog.type]} streak`}>🔥 {streak}</span>
      <button className="habit-edit" title="Edit habit" onClick={() => setEditing(true)}>✎</button>
      <button className="habit-arc" title="Archive habit" onClick={archive}>⊡</button>
    </div>
  );
}

function HabitDone({ habit, day }) {
  const entry = habit.completions[day];
  const timeStr = entry?.completedAt ? new Date(entry.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <div className="habit-done">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="habit-name">{habit.text}</div>
        {entry?.note && <div className="habit-done-note">{entry.note}</div>}
      </div>
      <span className="habit-done-time">{timeStr}</span>
    </div>
  );
}

const fieldStyle = { background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 16, padding: '6px 10px', outline: 'none' };
const monoFieldStyle = { ...fieldStyle, fontFamily: 'var(--font-mono)', cursor: 'pointer' };

function ScheduleControl({ schedule, setSchedule }) {
  const type = schedule.type;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        value={type}
        onChange={e => {
          const t = e.target.value;
          setSchedule(t === 'daily' ? { type: 'daily' } : { type: t, target: schedule.target || 3 });
        }}
        style={{ ...monoFieldStyle, color: 'var(--text)' }}
      >
        <option value="daily">Daily</option>
        <option value="weekly">Per week</option>
        <option value="monthly">Per month</option>
      </select>
      {type !== 'daily' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            min="1"
            max={type === 'weekly' ? 7 : 31}
            value={schedule.target || 1}
            onChange={e => setSchedule({ type, target: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            style={{ ...fieldStyle, width: 56, textAlign: 'center' }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)' }}>× / {type === 'weekly' ? 'week' : 'month'}</span>
        </div>
      )}
    </div>
  );
}

function HabitAddForm({ categories, refresh, onClose }) {
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [schedule, setSchedule] = useState({ type: 'daily' });

  const handleAdd = () => {
    if (!text.trim()) return;
    addHabit({ text: text.trim(), categoryId: categoryId || undefined, schedule });
    refresh();
    onClose();
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          autoFocus
          placeholder="Habit name..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose(); }}
          style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
        />
        {categories.length > 0 && (
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...monoFieldStyle, color: categoryId ? 'var(--text)' : 'var(--text-dimmer)' }}>
            <option value="">Topic...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <ScheduleControl schedule={schedule} setSchedule={setSchedule} />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" style={{ background: 'var(--c-habits)', borderColor: 'var(--c-habits)' }} onClick={handleAdd}>Add Habit</button>
        </div>
      </div>
    </div>
  );
}

function HabitEditForm({ habit, categories, refresh, onClose }) {
  const [text, setText] = useState(habit.text);
  const [categoryId, setCategoryId] = useState(habit.categoryId || '');
  const [schedule, setSchedule] = useState(habit.schedule || { type: 'daily' });

  const save = () => {
    if (!text.trim()) return;
    updateHabit(habit.id, { text: text.trim(), categoryId: categoryId || null, schedule });
    refresh();
    onClose();
  };
  const archive = () => {
    if (window.confirm(`Archive "${habit.text}"? Its streak history is kept.`)) { archiveHabit(habit.id); refresh(); onClose(); }
  };

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }}
          style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
        />
        {categories.length > 0 && (
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...monoFieldStyle, color: categoryId ? 'var(--text)' : 'var(--text-dimmer)' }}>
            <option value="">Topic...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <ScheduleControl schedule={schedule} setSchedule={setSchedule} />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={archive} style={{ background: 'transparent', borderColor: '#e05050', color: '#e05050' }}>Archive</button>
          <button className="btn primary" style={{ background: 'var(--c-habits)', borderColor: 'var(--c-habits)' }} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
