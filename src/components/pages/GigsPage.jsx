import React, { useState, useMemo, useEffect } from 'react';
import { getEvents, addEvent, updateEvent, addEventLogEntry, archiveEvent, deleteEvent, getMeetings, addMeeting, updateMeeting, addMeetingLogEntry, archiveMeeting, deleteMeeting, getCategories, todayKey } from '../../db';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 600);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
}

function daysUntil(dateStr, today) {
  return Math.round((new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
}

function byDateThenTime(a, b) {
  return (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
}

function countdown(diff) {
  if (diff < 0)  return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${diff} days away`;
}

function monthLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Groups a date-sorted list into consecutive month runs: [{ key, label, items }].
function groupByMonth(items) {
  const groups = [];
  let cur = null;
  for (const it of items) {
    const key = it.date.slice(0, 7); // YYYY-MM
    if (!cur || cur.key !== key) { cur = { key, label: monthLabel(it.date), items: [] }; groups.push(cur); }
    cur.items.push(it);
  }
  return groups;
}

// Merges gigs + meetings into shared, chronologically-sorted month buckets so the
// two columns can line up month-for-month: [{ key, label, gigs, meetings }].
function mergeMonths(gigs, meetings) {
  const map = new Map();
  const bucket = (dateStr) => {
    const key = dateStr.slice(0, 7); // YYYY-MM
    if (!map.has(key)) map.set(key, { key, label: monthLabel(dateStr), gigs: [], meetings: [] });
    return map.get(key);
  };
  for (const g of gigs) bucket(g.date).gigs.push(g);
  for (const m of meetings) bucket(m.date).meetings.push(m);
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function MonthHeader({ label, count, expanded, onToggle, onArchive, style }) {
  return (
    <div
      className={`gig-month-hd${expanded ? '' : ' collapsed'}`}
      style={style}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    >
      <span className="gig-month-caret">▾</span>
      <span>{label}</span>
      <span className="gig-month-right">
        {onArchive && count > 0 && (
          <button className="gig-month-archive" onClick={e => { e.stopPropagation(); onArchive(); }}>Archive all</button>
        )}
        {!expanded && count > 0 && <span className="gig-month-count">{count}</span>}
      </span>
    </div>
  );
}

export default function GigsPage({ refresh, tick, openArchive, openLogPopup }) {
  const today = todayKey();
  const isMobile = useIsMobile();
  const [addingGig, setAddingGig] = useState(false);
  const [addingMeeting, setAddingMeeting] = useState(false);

  const gigs = useMemo(() => getEvents().filter(e => !e.archived).sort(byDateThenTime), [tick]);
  const meetings = useMemo(() => getMeetings().filter(m => !m.archived).sort(byDateThenTime), [tick]);
  const categories = useMemo(() => getCategories(), [tick]);

  const itemProps = { today, refresh, categories, openLogPopup };

  // Collapsible months: past months default collapsed; a user toggle overrides the default.
  const curMonth = today.slice(0, 7);
  const [monthOverrides, setMonthOverrides] = useState({});
  const isExpanded = key => (key in monthOverrides ? monthOverrides[key] : key >= curMonth);
  const toggleMonth = key => setMonthOverrides(o => ({ ...o, [key]: !isExpanded(key) }));

  const archiveAll = (items, archiveFn, label, noun) => {
    const n = items.length;
    if (!n) return;
    if (!window.confirm(`Archive all ${n} ${noun}${n > 1 ? 's' : ''} in ${label}?`)) return;
    items.forEach(it => archiveFn(it.id));
    refresh();
  };
  const archiveMonth = mo => {
    const n = mo.gigs.length + mo.meetings.length;
    if (!n) return;
    if (!window.confirm(`Archive all ${n} item${n > 1 ? 's' : ''} in ${mo.label}?`)) return;
    mo.gigs.forEach(g => archiveEvent(g.id));
    mo.meetings.forEach(m => archiveMeeting(m.id));
    refresh();
  };

  const GigsHd = (
    <div className="section-hd">
      <span className="section-title gigs">Gigs</span>
      <button className="btn primary" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px' }} onClick={() => setAddingGig(a => !a)}>+ New Gig</button>
    </div>
  );
  const MeetingsHd = (
    <div className="section-hd">
      <span className="section-title inprogress">Engagements</span>
      <button className="btn primary" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px', background: 'var(--c-inprogress)', borderColor: 'var(--c-inprogress)' }} onClick={() => setAddingMeeting(a => !a)}>+ New Engagement</button>
    </div>
  );
  const emptyNote = txt => <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)', padding: '20px 0' }}>{txt}</div>;

  // Mobile: two independent stacked lists, each grouped by month on its own.
  if (isMobile) {
    return (
      <div className="page">
        <div className="page-grid">
          <section className="section" id="section-gigs-list">
            {GigsHd}
            {addingGig && <GigAddForm categories={categories} refresh={refresh} onClose={() => setAddingGig(false)} />}
            <div className="gig-list">
              {groupByMonth(gigs).map(group => (
                <React.Fragment key={group.key}>
                  <MonthHeader label={group.label} count={group.items.length} expanded={isExpanded(group.key)} onToggle={() => toggleMonth(group.key)} onArchive={() => archiveAll(group.items, archiveEvent, group.label, 'gig')} />
                  {isExpanded(group.key) && group.items.map(evt => <GigItem key={evt.id} evt={evt} {...itemProps} />)}
                </React.Fragment>
              ))}
              {gigs.length === 0 && !addingGig && emptyNote('No gigs yet.')}
            </div>
          </section>
          <section className="section" id="section-meetings-list">
            {MeetingsHd}
            {addingMeeting && <MeetingAddForm categories={categories} refresh={refresh} onClose={() => setAddingMeeting(false)} />}
            <div className="gig-list">
              {groupByMonth(meetings).map(group => (
                <React.Fragment key={group.key}>
                  <MonthHeader label={group.label} count={group.items.length} expanded={isExpanded(group.key)} onToggle={() => toggleMonth(group.key)} onArchive={() => archiveAll(group.items, archiveMeeting, group.label, 'engagement')} />
                  {isExpanded(group.key) && group.items.map(mtg => <MeetingItem key={mtg.id} mtg={mtg} {...itemProps} />)}
                </React.Fragment>
              ))}
              {meetings.length === 0 && !addingMeeting && emptyNote('No engagements yet.')}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Desktop: one shared grid so each month lines up across both columns.
  const months = mergeMonths(gigs, meetings);
  return (
    <div className="page">
      <div className="gigs-aligned">
        {GigsHd}
        {MeetingsHd}
        {(addingGig || addingMeeting) && (
          <>
            <div>{addingGig && <GigAddForm categories={categories} refresh={refresh} onClose={() => setAddingGig(false)} />}</div>
            <div>{addingMeeting && <MeetingAddForm categories={categories} refresh={refresh} onClose={() => setAddingMeeting(false)} />}</div>
          </>
        )}
        {months.map(mo => (
          <React.Fragment key={mo.key}>
            <MonthHeader label={mo.label} count={mo.gigs.length + mo.meetings.length} expanded={isExpanded(mo.key)} onToggle={() => toggleMonth(mo.key)} onArchive={() => archiveMonth(mo)} style={{ gridColumn: '1 / -1' }} />
            {isExpanded(mo.key) && <div className="month-col">{mo.gigs.map(evt => <GigItem key={evt.id} evt={evt} {...itemProps} />)}</div>}
            {isExpanded(mo.key) && <div className="month-col">{mo.meetings.map(mtg => <MeetingItem key={mtg.id} mtg={mtg} {...itemProps} />)}</div>}
          </React.Fragment>
        ))}
        {months.length === 0 && !addingGig && !addingMeeting && (
          <div style={{ gridColumn: '1 / -1' }}>{emptyNote('No gigs or engagements yet.')}</div>
        )}
      </div>
    </div>
  );
}

// ── Add forms ──────────────────────────────────────────────────────────────────

function GigAddForm({ categories, refresh, onClose }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !date) return;
    addEvent({ name: name.trim(), date, time: time || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined });
    refresh();
    onClose();
  };

  return (
    <AddForm
      namePlaceholder="Gig name..."
      name={name} setName={setName}
      date={date} setDate={setDate}
      time={time} setTime={setTime}
      notes={notes} setNotes={setNotes}
      categoryId={categoryId} setCategoryId={setCategoryId}
      categories={categories}
      onAdd={handleAdd}
      onCancel={onClose}
      addLabel="Add Gig"
    />
  );
}

function MeetingAddForm({ categories, refresh, onClose }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !date) return;
    addMeeting({ name: name.trim(), date, time: time || undefined, location: location.trim() || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined });
    refresh();
    onClose();
  };

  return (
    <AddForm
      namePlaceholder="Meeting name..."
      name={name} setName={setName}
      date={date} setDate={setDate}
      time={time} setTime={setTime}
      location={location} setLocation={setLocation}
      notes={notes} setNotes={setNotes}
      categoryId={categoryId} setCategoryId={setCategoryId}
      categories={categories}
      onAdd={handleAdd}
      onCancel={onClose}
      addLabel="Add Meeting"
    />
  );
}

function GigItem({ evt, today, refresh, categories, openLogPopup }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(evt.name);
  const [date, setDate]       = useState(evt.date);
  const [time, setTime]       = useState(evt.time || '');
  const [notes, setNotes]     = useState(evt.notes || '');
  const [categoryId, setCategoryId] = useState(evt.categoryId || '');

  const diff    = daysUntil(evt.date, today);
  const d       = new Date(evt.date + 'T00:00:00');
  const timeStr = evt.time ? new Date(`1970-01-01T${evt.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  const cat     = evt.categoryId ? (categories || []).find(c => c.id === evt.categoryId) : null;

  const handleSave = () => {
    if (!name.trim() || !date) return;
    const updates = { name: name.trim(), date, time: time || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined };
    updateEvent(evt.id, updates);
    setEditing(false);
    refresh();
  };

  const handleDelete = () => {
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
          <input type="date" value={date} onChange={e => setDate(e.target.value)} onBlur={e => setDate(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} onBlur={e => setTime(e.target.value)}
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
        <div className="gig-weekday">{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</div>
      </div>
      <div className="gig-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className={`gig-name${evt.done ? ' done' : ''}`}>{evt.name}</div>
          {cat && <span className="gig-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--c-gigs)', border: '1px solid var(--c-gigs)', borderRadius: 3, padding: '1px 5px', opacity: 0.8, flexShrink: 0 }}>{cat.name}</span>}
        </div>
        <div className="gig-countdown">
          {countdown(diff)}
          {timeStr && <span style={{ color: 'var(--text-dimmer)', marginLeft: 6 }}>· {timeStr}</span>}
        </div>
        {evt.notes && <div className="gig-notes">{evt.notes}</div>}
        {evt.done && (evt.log || []).filter(e => e.type === 'completed' && e.note).map(e => (
          <div key={e.id} className="gig-notes" style={{ fontStyle: 'italic', opacity: 0.7 }}>{e.note}</div>
        ))}
      </div>
      <div className="gig-actions">
        <button className="o-act" onClick={() => { setName(evt.name); setDate(evt.date); setTime(evt.time || ''); setNotes(evt.notes || ''); setCategoryId(evt.categoryId || ''); setEditing(true); }}>Edit</button>
        <button className="o-act" onClick={() => { archiveEvent(evt.id); refresh(); }}>Archive</button>
      </div>
      <div className={`gig-check${evt.done ? ' done' : ''}`} onClick={() => {
        if (!evt.done) {
          openLogPopup(null, 'done', (note) => {
            updateEvent(evt.id, { done: true, doneAt: Date.now() });
            if (note) addEventLogEntry(evt.id, { type: 'completed', note });
            refresh();
          }, evt.name);
        } else {
          updateEvent(evt.id, { done: false, doneAt: null }); refresh();
        }
      }} />
    </div>
  );
}

// ── Meetings ──────────────────────────────────────────────────────────────────

function MeetingItem({ mtg, today, refresh, categories, openLogPopup }) {
  const [editing, setEditing]     = useState(false);
  const [name, setName]           = useState(mtg.name);
  const [date, setDate]           = useState(mtg.date);
  const [time, setTime]           = useState(mtg.time || '');
  const [location, setLocation]   = useState(mtg.location || '');
  const [notes, setNotes]         = useState(mtg.notes || '');
  const [categoryId, setCategoryId] = useState(mtg.categoryId || '');

  const diff    = daysUntil(mtg.date, today);
  const d       = new Date(mtg.date + 'T00:00:00');
  const timeStr = mtg.time ? new Date(`1970-01-01T${mtg.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  const cat     = mtg.categoryId ? (categories || []).find(c => c.id === mtg.categoryId) : null;

  const handleSave = () => {
    if (!name.trim() || !date) return;
    const updates = { name: name.trim(), date, time: time || undefined, location: location.trim() || undefined, notes: notes.trim() || undefined, categoryId: categoryId || undefined };
    updateMeeting(mtg.id, updates);
    setEditing(false);
    refresh();
  };

  const handleDelete = () => {
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
          <input type="date" value={date} onChange={e => setDate(e.target.value)} onBlur={e => setDate(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} onBlur={e => setTime(e.target.value)}
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
        <div className="gig-weekday">{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</div>
      </div>
      <div className="gig-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className={`gig-name${mtg.done ? ' done' : ''}`}>{mtg.name}</div>
          {cat && <span className="gig-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--c-inprogress)', border: '1px solid var(--c-inprogress)', borderRadius: 3, padding: '1px 5px', opacity: 0.8, flexShrink: 0 }}>{cat.name}</span>}
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
        {mtg.done && (mtg.log || []).filter(e => e.type === 'completed' && e.note).map(e => (
          <div key={e.id} className="gig-notes" style={{ fontStyle: 'italic', opacity: 0.7 }}>{e.note}</div>
        ))}
      </div>
      <div className="gig-actions">
        <button className="o-act" onClick={() => { setName(mtg.name); setDate(mtg.date); setTime(mtg.time || ''); setLocation(mtg.location || ''); setNotes(mtg.notes || ''); setCategoryId(mtg.categoryId || ''); setEditing(true); }}>Edit</button>
        <button className="o-act" onClick={() => { archiveMeeting(mtg.id); refresh(); }}>Archive</button>
      </div>
      <div className={`gig-check${mtg.done ? ' done' : ''}`} onClick={() => {
        if (!mtg.done) {
          openLogPopup(null, 'done', (note) => {
            updateMeeting(mtg.id, { done: true, doneAt: Date.now() });
            if (note) addMeetingLogEntry(mtg.id, { type: 'completed', note });
            refresh();
          }, mtg.name);
        } else {
          updateMeeting(mtg.id, { done: false, doneAt: null }); refresh();
        }
      }} />
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function AddForm({ namePlaceholder, name, setName, date, setDate, time, setTime, location, setLocation, notes, setNotes, categoryId, setCategoryId, categories, onAdd, onCancel, addLabel }) {
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
          onBlur={e => setDate(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 9px', outline: 'none', colorScheme: 'dark' }}
        />
        {setTime !== undefined && (
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            onBlur={e => setTime(e.target.value)}
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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={onAdd}>{addLabel}</button>
      </div>
    </div>
  );
}
