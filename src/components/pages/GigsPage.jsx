import React, { useState, useMemo } from 'react';
import { getEvents, addEvent, updateEvent, archiveEvent, todayKey } from '../../db';

function daysUntil(dateStr, today) {
  return Math.round((new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
}

export default function GigsPage({ refresh, tick }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const today = todayKey();

  const events = useMemo(() => {
    return getEvents()
      .filter(e => !e.archived)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [tick]);

  const handleAdd = () => {
    if (!newName.trim() || !newDate) return;
    addEvent({ name: newName.trim(), date: newDate, notes: newNotes.trim() || undefined });
    setNewName(''); setNewDate(''); setNewNotes(''); setAdding(false);
    refresh();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Gigs</div>
        <div className="page-subtitle">· upcoming · sorted by date</div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setAdding(a => !a)}>+ Gig</button>
        </div>
      </div>

      <div className="page-grid single">
        {adding && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                autoFocus
                placeholder="Gig name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '6px 10px', outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
              />
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 10px', outline: 'none' }}
              />
            </div>
            <input
              placeholder="Notes (optional)..."
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 13, padding: '6px 10px', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn primary" onClick={handleAdd}>Add Gig</button>
            </div>
          </div>
        )}

        <div className="gig-list">
          {events.map(evt => <GigItem key={evt.id} evt={evt} today={today} refresh={refresh} />)}
          {events.length === 0 && !adding && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)', padding: '20px 0' }}>
              No gigs yet. Add one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GigItem({ evt, today, refresh }) {
  const diff = daysUntil(evt.date, today);
  const isPast = diff < 0;
  const d = new Date(evt.date + 'T00:00:00');
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  const countdown = isPast
    ? `Passed · ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago`
    : diff === 0 ? 'Today!'
    : diff === 1 ? 'Tomorrow'
    : `${diff} days away`;

  return (
    <div className={`gig-item${evt.done ? ' done-gig' : ''}`}>
      <div className="gig-date">
        <div className="gig-month">{month}</div>
        <div className="gig-day">{day}</div>
      </div>
      <div className="gig-body">
        <div className={`gig-name${evt.done ? ' done' : ''}`}>{evt.name}</div>
        <div className="gig-countdown">{countdown}</div>
        {evt.notes && <div className="gig-notes">{evt.notes}</div>}
      </div>
      <div className="gig-actions">
        <button className="o-act" onClick={() => { archiveEvent(evt.id); refresh(); }}>Archive</button>
      </div>
      <div
        className={`gig-check${evt.done ? ' done' : ''}`}
        onClick={() => { updateEvent(evt.id, { done: !evt.done }); refresh(); }}
      />
    </div>
  );
}
