import React, { useState, useMemo } from 'react';
import { getEvents, addEvent, updateEvent, archiveEvent, deleteEvent, getMeetings, addMeeting, updateMeeting, archiveMeeting, deleteMeeting, getCategories, todayKey } from '../../db';
import { syncToCalendar, removeFromCalendar, calendarReady } from '../../calendar';

function daysUntil(dateStr, today) {
  return Math.round((new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
}

function countdown(diff) {
  if (diff < 0)  return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${diff} days away`;
}

async function pushToCalendar(item, addToCouples, saveFn) {
  if (!item.date) return;
  try {
    const calendarIds = await syncToCalendar(item, addToCouples);
    saveFn({ calendarIds });
  } catch (e) {
    console.warn('Calendar sync failed:', e);
  }
}

export default function GigsPage({ refresh, tick, openArchive }) {
  const today = todayKey();
  const [addingGig, setAddingGig] = useState(false);
  const [addingMeeting, setAddingMeeting] = useState(false);

  const gigs = useMemo(() =>
    getEvents().filter(e => !e.archived).sort((a, b) => a.date.localeCompare(b.date)),
  [tick]);

  const meetings = useMemo(() =>
    getMeetings().filter(m => !m.archived).sort((a, b) => a.date.localeCompare(b.date)),
  [tick]);

  const categories = useMemo(() => getCategories(), [tick]);

  return (
    <div className="page">
      <div className="page-grid">
        <section className="section" id="section-gigs-list">
          <div className="section-hd">
            <span className="section-title gigs">Gigs</span>
            <button className="btn primary" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px' }} onClick={() => setAddingGig(a => !a)}>+ New Gig</button>
          </div>
          <GigsList gigs={gigs} today={today} refresh={refresh} adding={addingGig} setAdding={setAddingGig} categories={categories} />
        </section>
        <section className="section" id="section-meetings-list">
          <div className="section-hd">
            <span className="section-title inprogress">Meetings</span>
            <button className="btn primary" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px', background: 'var(--c-inprogress)', borderColor: 'var(--c-inprogress)' }} onClick={() => setAddingMeeting(a => !a)}>+ New Meeting</button>
          </div>
          <MeetingsList meetings={meetings} today={today} refresh={refresh} adding={addingMeeting} setAdding={setAddingMeeting} categories={categories} />
        </section>
      </div>
    </div>
  );
}

// ── Gigs ──────────────────────────────────────────────────────────────────────

function GigsList({ gigs, today, refresh, adding, setAdding, categories }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [addToCouples, setAddToCouples] = useState(true);

  const handleAdd = () => {
    if (!name.trim() || !date) return;
    const evt = addEvent({ name: name.trim(), date, time: time || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined, addToCouples });
    setName(''); setDate(''); setTime(''); setNotes(''); setCategoryId(''); setAddToCouples(true); setAdding(false);
    refresh();
    pushToCalendar(evt, addToCouples, updates => updateEvent(evt.id, updates));
  };

  return (
    <>
      {adding && (
        <AddForm
          namePlaceholder="Gig name..."
          date={date} setDate={setDate}
          name={name} setName={setName}
          time={time} setTime={setTime}
          notes={notes} setNotes={setNotes}
          categoryId={categoryId} setCategoryId={setCategoryId}
          categories={categories}
          addToCouples={addToCouples} setAddToCouples={setAddToCouples}
          onAdd={handleAdd}
          onCancel={() => setAdding(false)}
          addLabel="Add Gig"
        />
      )}
      <div className="gig-list">
        {gigs.map(evt => <GigItem key={evt.id} evt={evt} today={today} refresh={refresh} categories={categories} />)}
        {gigs.length === 0 && !adding && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)', padding: '20px 0' }}>No gigs yet.</div>
        )}
      </div>
    </>
  );
}

function GigItem({ evt, today, refresh, categories }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(evt.name);
  const [date, setDate]       = useState(evt.date);
  const [time, setTime]       = useState(evt.time || '');
  const [notes, setNotes]     = useState(evt.notes || '');
  const [categoryId, setCategoryId] = useState(evt.categoryId || '');
  const [addToCouples, setAddToCouples] = useState(evt.addToCouples ?? true);

  const diff    = daysUntil(evt.date, today);
  const d       = new Date(evt.date + 'T00:00:00');
  const timeStr = evt.time ? new Date(`1970-01-01T${evt.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  const cat     = evt.categoryId ? (categories || []).find(c => c.id === evt.categoryId) : null;

  const handleSave = () => {
    if (!name.trim() || !date) return;
    const updates = { name: name.trim(), date, time: time || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined, addToCouples };
    updateEvent(evt.id, updates);
    setEditing(false);
    refresh();
    const updated = { ...evt, ...updates };
    pushToCalendar(updated, addToCouples, calUpdates => updateEvent(evt.id, calUpdates));
  };

  const handleDelete = () => {
    removeFromCalendar(evt);
    deleteEvent(evt.id);
    refresh();
  };

  if (editing) {
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 13, padding: '5px 9px', outline: 'none' }} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: time ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Notes (optional)..." value={notes} onChange={e => setNotes(e.target.value)}
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '5px 9px', outline: 'none' }} />
          {categories && categories.length > 0 && (
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: categoryId ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark', cursor: 'pointer' }}>
              <option value="">Topic...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <CouplesToggle value={addToCouples} onChange={setAddToCouples} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn" onClick={handleDelete} style={{ background: 'transparent', borderColor: '#e05050', color: '#e05050' }}>Delete</button>
          <button className="btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`gig-item${evt.done ? ' done-gig' : ''}`}>
      <div className="gig-date">
        <div className="gig-month">{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
        <div className="gig-day">{d.getDate()}</div>
      </div>
      <div className="gig-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className={`gig-name${evt.done ? ' done' : ''}`}>{evt.name}</div>
          {cat && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--c-gigs)', border: '1px solid var(--c-gigs)', borderRadius: 3, padding: '1px 5px', opacity: 0.8, flexShrink: 0 }}>{cat.name}</span>}
          {evt.calendarIds?.taskMaster && <CalBadge couples={!!(evt.addToCouples ?? true)} />}
        </div>
        <div className="gig-countdown">
          {countdown(diff)}
          {timeStr && <span style={{ color: 'var(--text-dimmer)', marginLeft: 6 }}>· {timeStr}</span>}
        </div>
        {evt.notes && <div className="gig-notes">{evt.notes}</div>}
      </div>
      <div className="gig-actions">
        <button className="o-act" onClick={() => { setName(evt.name); setDate(evt.date); setTime(evt.time || ''); setNotes(evt.notes || ''); setCategoryId(evt.categoryId || ''); setAddToCouples(evt.addToCouples ?? true); setEditing(true); }}>Edit</button>
        <button className="o-act" onClick={() => { archiveEvent(evt.id); refresh(); }}>Archive</button>
      </div>
      <div className={`gig-check${evt.done ? ' done' : ''}`} onClick={() => { updateEvent(evt.id, { done: !evt.done }); refresh(); }} />
    </div>
  );
}

// ── Meetings ──────────────────────────────────────────────────────────────────

function MeetingsList({ meetings, today, refresh, adding, setAdding, categories }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [addToCouples, setAddToCouples] = useState(true);

  const handleAdd = () => {
    if (!name.trim() || !date) return;
    const mtg = addMeeting({ name: name.trim(), date, time: time || undefined, location: location.trim() || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined, addToCouples });
    setName(''); setDate(''); setTime(''); setLocation(''); setNotes(''); setCategoryId(''); setAddToCouples(true); setAdding(false);
    refresh();
    pushToCalendar(mtg, addToCouples, updates => updateMeeting(mtg.id, updates));
  };

  return (
    <>
      {adding && (
        <AddForm
          namePlaceholder="Meeting name..."
          date={date} setDate={setDate}
          name={name} setName={setName}
          time={time} setTime={setTime}
          location={location} setLocation={setLocation}
          notes={notes} setNotes={setNotes}
          categoryId={categoryId} setCategoryId={setCategoryId}
          categories={categories}
          addToCouples={addToCouples} setAddToCouples={setAddToCouples}
          onAdd={handleAdd}
          onCancel={() => setAdding(false)}
          addLabel="Add Meeting"
        />
      )}
      <div className="gig-list">
        {meetings.map(mtg => <MeetingItem key={mtg.id} mtg={mtg} today={today} refresh={refresh} categories={categories} />)}
        {meetings.length === 0 && !adding && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)', padding: '20px 0' }}>No meetings yet.</div>
        )}
      </div>
    </>
  );
}

function MeetingItem({ mtg, today, refresh, categories }) {
  const [editing, setEditing]     = useState(false);
  const [name, setName]           = useState(mtg.name);
  const [date, setDate]           = useState(mtg.date);
  const [time, setTime]           = useState(mtg.time || '');
  const [location, setLocation]   = useState(mtg.location || '');
  const [notes, setNotes]         = useState(mtg.notes || '');
  const [categoryId, setCategoryId] = useState(mtg.categoryId || '');
  const [addToCouples, setAddToCouples] = useState(mtg.addToCouples ?? true);

  const diff    = daysUntil(mtg.date, today);
  const d       = new Date(mtg.date + 'T00:00:00');
  const timeStr = mtg.time ? new Date(`1970-01-01T${mtg.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  const cat     = mtg.categoryId ? (categories || []).find(c => c.id === mtg.categoryId) : null;

  const handleSave = () => {
    if (!name.trim() || !date) return;
    const updates = { name: name.trim(), date, time: time || undefined, location: location.trim() || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined, addToCouples };
    updateMeeting(mtg.id, updates);
    setEditing(false);
    refresh();
    const updated = { ...mtg, ...updates };
    pushToCalendar(updated, addToCouples, calUpdates => updateMeeting(mtg.id, calUpdates));
  };

  const handleDelete = () => {
    removeFromCalendar(mtg);
    deleteMeeting(mtg.id);
    refresh();
  };

  if (editing) {
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 13, padding: '5px 9px', outline: 'none' }} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: time ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }} />
        </div>
        <input placeholder="Location or link (optional)..." value={location} onChange={e => setLocation(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '5px 9px', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Notes (optional)..." value={notes} onChange={e => setNotes(e.target.value)}
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '5px 9px', outline: 'none' }} />
          {categories && categories.length > 0 && (
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: categoryId ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark', cursor: 'pointer' }}>
              <option value="">Topic...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <CouplesToggle value={addToCouples} onChange={setAddToCouples} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn" onClick={handleDelete} style={{ background: 'transparent', borderColor: '#e05050', color: '#e05050' }}>Delete</button>
          <button className="btn primary" style={{ background: 'var(--c-inprogress)', borderColor: 'var(--c-inprogress)' }} onClick={handleSave}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`gig-item meeting${mtg.done ? ' done-gig' : ''}`}>
      <div className="gig-date">
        <div className="gig-month">{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
        <div className="gig-day">{d.getDate()}</div>
      </div>
      <div className="gig-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className={`gig-name${mtg.done ? ' done' : ''}`}>{mtg.name}</div>
          {cat && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--c-inprogress)', border: '1px solid var(--c-inprogress)', borderRadius: 3, padding: '1px 5px', opacity: 0.8, flexShrink: 0 }}>{cat.name}</span>}
          {mtg.calendarIds?.taskMaster && <CalBadge couples={!!(mtg.addToCouples ?? true)} />}
        </div>
        <div className="gig-countdown">
          {countdown(diff)}
          {timeStr && <span style={{ color: 'var(--text-dimmer)', marginLeft: 6 }}>· {timeStr}</span>}
        </div>
        {mtg.location && (
          <div className="gig-notes">
            {/^https?:\/\//.test(mtg.location)
              ? <a href={mtg.location} target="_blank" rel="noreferrer" style={{ color: 'var(--c-inprogress)', textDecoration: 'none' }}>{mtg.location}</a>
              : mtg.location}
          </div>
        )}
        {mtg.notes && <div className="gig-notes">{mtg.notes}</div>}
      </div>
      <div className="gig-actions">
        <button className="o-act" onClick={() => { setName(mtg.name); setDate(mtg.date); setTime(mtg.time || ''); setLocation(mtg.location || ''); setNotes(mtg.notes || ''); setCategoryId(mtg.categoryId || ''); setAddToCouples(mtg.addToCouples ?? true); setEditing(true); }}>Edit</button>
        <button className="o-act" onClick={() => { archiveMeeting(mtg.id); refresh(); }}>Archive</button>
      </div>
      <div className={`gig-check${mtg.done ? ' done' : ''}`} onClick={() => { updateMeeting(mtg.id, { done: !mtg.done }); refresh(); }} />
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function CouplesToggle({ value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 28, height: 16, borderRadius: 8, position: 'relative', flexShrink: 0,
          background: value ? 'var(--c-grateful)' : 'var(--border2)',
          transition: 'background 0.15s', cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: value ? 14 : 2,
          width: 12, height: 12, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s',
        }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: value ? 'var(--text-dim)' : 'var(--text-dimmer)', letterSpacing: '0.06em' }}>
        Add to Couples calendar
      </span>
    </label>
  );
}

function CalBadge({ couples }) {
  return (
    <span title={couples ? 'On Task Master + Couples calendars' : 'On Task Master calendar'} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#5a9a6a', border: '1px solid #5a9a6a', borderRadius: 3, padding: '1px 5px', opacity: 0.8, flexShrink: 0 }}>
      {couples ? '📅 +Couples' : '📅'}
    </span>
  );
}

function AddForm({ namePlaceholder, name, setName, date, setDate, time, setTime, location, setLocation, notes, setNotes, categoryId, setCategoryId, categories, addToCouples, setAddToCouples, onAdd, onCancel, addLabel }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          autoFocus
          placeholder={namePlaceholder}
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 13, padding: '5px 9px', outline: 'none' }}
          onKeyDown={e => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancel(); }}
        />
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }}
        />
        {setTime !== undefined && (
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: time ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }}
          />
        )}
      </div>
      {setLocation !== undefined && (
        <input
          placeholder="Location or link (optional)..."
          value={location}
          onChange={e => setLocation(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '5px 9px', outline: 'none' }}
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Notes (optional)..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 12, padding: '5px 9px', outline: 'none' }}
        />
        {categories && categories.length > 0 && (
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: categoryId ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark', cursor: 'pointer' }}
          >
            <option value="">Topic...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <CouplesToggle value={addToCouples} onChange={setAddToCouples} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={onAdd}>{addLabel}</button>
        </div>
      </div>
    </div>
  );
}
