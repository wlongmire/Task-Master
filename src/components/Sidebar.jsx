import React, { useMemo, useState, useRef } from 'react';
import MiniCalendar from './shared/MiniCalendar';
import TopicPopup from './shared/TopicPopup';
import { getTasks, getEvents, getHabits, getCategories, getArchivedCategories, addCategory, updateCategory, archiveCategory, restoreCategory, deleteCategory, todayKey, offsetDate, exportData, importData, clearAllData } from '../db';

const PAGES = [
  { id: 'daily',  label: 'Daily',      color: 'var(--c-grateful)' },
  { id: 'todo',   label: 'To Do',      color: 'var(--c-todo)' },
  { id: 'active', label: 'Active',     color: 'var(--c-inprogress)' },
  { id: 'gigs',   label: 'Gigs',       color: 'var(--c-gigs)' },
  { id: 'habits', label: 'Habits',     color: 'var(--c-habits)' },
];

const TOPIC_COLORS = [
  'var(--c-todo)', 'var(--c-inprogress)', 'var(--c-backlog)',
  'var(--c-completed)', 'var(--c-grateful)', 'var(--c-intentions)',
];

export default function Sidebar({ page, setPage, viewDay, setViewDay, tick, onClearData, openArchive, archiveOpen, onCloseArchive, onTopicChange, onSignOut, mobileOpen, onMobileClose }) {
  const today = todayKey();
  const [confirmClear, setConfirmClear] = useState(false);
  const [importError, setImportError] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);
  const [topicPopup, setTopicPopup] = useState(null);       // active topic popup
  const [archivedPopup, setArchivedPopup] = useState(null); // archived topic popup
  const [archivedOpen, setArchivedOpen] = useState(false);  // archived section toggle
  const newTopicRef = useRef();
  const fileInputRef = useRef();

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected
    importData(file)
      .then(() => { onClearData(); setImportError(null); })
      .catch(err => setImportError(err.message));
  };

  const topics         = useMemo(() => getCategories(), [tick]);
  const archivedTopics = useMemo(() => getArchivedCategories(), [tick]);

  const handleAddTopic = () => {
    const cat = addCategory({ name: 'New Topic', color: TOPIC_COLORS[topics.length % TOPIC_COLORS.length] });
    onTopicChange?.();
    setEditingTopic(cat.id);
  };

  const handleRenameTopic = (id, name) => {
    updateCategory(id, { name: name.trim() || 'Untitled' });
    onTopicChange?.();
    setEditingTopic(null);
  };

  const handleArchiveTopic = (id) => {
    archiveCategory(id);
    setTopicPopup(null);
    onTopicChange?.();
  };

  const handleRestoreTopic = (id) => {
    restoreCategory(id);
    setArchivedPopup(null);
    onTopicChange?.();
  };

  const handleDeleteTopic = (id) => {
    deleteCategory(id);
    setArchivedPopup(null);
    onTopicChange?.();
  };

  const counts = useMemo(() => {
    const tasks = getTasks().filter(t => !t.archived);
    const events = getEvents().filter(e => !e.archived);
    const habits = getHabits();
    return {
      todo:       tasks.filter(t => t.state === 'todo').length,
      backlog:    tasks.filter(t => t.state === 'backlog').length,
      inprogress: tasks.filter(t => t.state === 'inprogress').length,
      gigs:       events.filter(e => !e.done).length,
      habits:     habits.filter(h => !h.completions?.[today]).length, // still to do today
    };
  }, [tick]);

  const pageCounts = {
    todo:   counts.todo + counts.backlog,
    active: counts.inprogress,
    gigs:   counts.gigs,
    habits: counts.habits,
  };

  const prevDay = () => setViewDay(d => offsetDate(d, -1));
  const nextDay = () => { if (viewDay < today) setViewDay(d => offsetDate(d, 1)); };

  const formatDayLabel = (dk) => {
    if (dk === today) return 'Today';
    const d = new Date(dk + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <>
      {mobileOpen && (
        <div onClick={onMobileClose} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 19, display: 'none',
        }} className="sidebar-backdrop" />
      )}
    <aside style={{
      position: 'fixed', top: 0, left: 0,
      width: 'var(--sidebar-w)', height: '100vh',
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 20,
    }} className={mobileOpen ? 'sidebar-mobile-open' : ''}>
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
          onClick={() => {
            const section = document.getElementById(`section-${p.id}`);
            if (section) {
              section.scrollIntoView({ behavior: 'smooth' });
            } else {
              setPage(p.id);
            }
            onMobileClose?.();
          }}
        />
      ))}

      {/* Topics */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <div style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#666360', fontWeight: 500, flex: 1 }}>Topics</span>
          <button onClick={handleAddTopic} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#666360', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
            onMouseEnter={e => e.target.style.color = 'var(--text)'}
            onMouseLeave={e => e.target.style.color = '#666360'}
          >+</button>
        </div>
        {topics.map(topic => (
          <div key={topic.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 16px', borderLeft: '2px solid transparent' }}
            onMouseEnter={e => e.currentTarget.querySelector('.topic-arc').style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.querySelector('.topic-arc').style.opacity = '0'}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: '#44423e' }} />
            {editingTopic === topic.id ? (
              <input
                autoFocus
                defaultValue={topic.name}
                onBlur={e => handleRenameTopic(topic.id, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameTopic(topic.id, e.target.value);
                  if (e.key === 'Escape') setEditingTopic(null);
                }}
                style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '1px 5px', outline: 'none' }}
              />
            ) : (
              <span
                onClick={() => setTopicPopup(topic.id)}
                onDoubleClick={(e) => { e.stopPropagation(); setTopicPopup(null); setEditingTopic(topic.id); }}
                style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 12, color: '#b5b1a8', cursor: 'pointer', userSelect: 'none' }}>
                {topic.name}
              </span>
            )}
            <button className="topic-arc"
              title="Archive topic"
              onClick={() => handleArchiveTopic(topic.id)}
              style={{ opacity: 0, fontFamily: 'var(--font-mono)', fontSize: 9, color: '#666360', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'opacity 0.1s' }}
              onMouseEnter={e => e.target.style.color = 'var(--text-dim)'}
              onMouseLeave={e => e.target.style.color = '#666360'}
            >⊡</button>
          </div>
        ))}
        {topics.length === 0 && (
          <div style={{ padding: '4px 16px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#444240' }}>No topics yet</div>
        )}

        {/* Archived topics */}
        {archivedTopics.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button
              onClick={() => setArchivedOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#555250' }}>
                {archivedOpen ? '▾' : '▸'} Archived ({archivedTopics.length})
              </span>
            </button>
            {archivedOpen && archivedTopics.map(topic => (
              <div key={topic.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 16px 4px 24px' }}
                onMouseEnter={e => { e.currentTarget.querySelector('.arc-restore').style.opacity = '1'; e.currentTarget.querySelector('.arc-del').style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.querySelector('.arc-restore').style.opacity = '0'; e.currentTarget.querySelector('.arc-del').style.opacity = '0'; }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: '#333130' }} />
                <span
                  onClick={() => setArchivedPopup(topic.id)}
                  style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 12, color: '#666360', cursor: 'pointer', userSelect: 'none' }}>
                  {topic.name}
                </span>
                <button className="arc-restore"
                  title="Restore topic"
                  onClick={() => handleRestoreTopic(topic.id)}
                  style={{ opacity: 0, fontFamily: 'var(--font-mono)', fontSize: 9, color: '#666360', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'opacity 0.1s' }}
                  onMouseEnter={e => e.target.style.color = 'var(--c-completed)'}
                  onMouseLeave={e => e.target.style.color = '#666360'}
                >↩</button>
                <button className="arc-del"
                  title="Delete permanently"
                  onClick={() => handleDeleteTopic(topic.id)}
                  style={{ opacity: 0, fontFamily: 'var(--font-mono)', fontSize: 9, color: '#666360', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'opacity 0.1s' }}
                  onMouseEnter={e => e.target.style.color = '#e05050'}
                  onMouseLeave={e => e.target.style.color = '#666360'}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '10px 16px 2px', fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#666360', fontWeight: 500 }}>
          Settings
        </div>
        <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FooterBtn onClick={() => archiveOpen ? onCloseArchive() : openArchive('activity')}>⊡ Activity</FooterBtn>
          <FooterBtn onClick={exportData}>⬇ Export Data</FooterBtn>
          <FooterBtn onClick={() => fileInputRef.current?.click()}>⬆ Import Data</FooterBtn>
          <FooterBtn onClick={onSignOut}>→ Sign Out</FooterBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          {importError && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#e05050', padding: '4px 2px', lineHeight: 1.5 }}>
              {importError}
            </div>
          )}
          <FooterBtn danger onClick={() => setConfirmClear(true)}>⚠ Clear All Data</FooterBtn>
        </div>
      </div>

      {topicPopup && (
        <TopicPopup topicId={topicPopup} onClose={() => setTopicPopup(null)} tick={tick}
          onArchive={() => handleArchiveTopic(topicPopup)} />
      )}
      {archivedPopup && (
        <TopicPopup topicId={archivedPopup} onClose={() => setArchivedPopup(null)} tick={tick}
          archived
          onRestore={() => handleRestoreTopic(archivedPopup)}
          onDelete={() => handleDeleteTopic(archivedPopup)} />
      )}

      {confirmClear && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setConfirmClear(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: '28px 32px', width: 360,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
              Clear all data?
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              This will permanently delete all tasks, gigs, gratitudes, intentions, and settings.
              This cannot be undone.
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#e05050', background: 'rgba(224,80,80,0.08)', border: '1px solid rgba(224,80,80,0.2)', borderRadius: 4, padding: '8px 12px' }}>
              Export your data first if you want a backup.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button
                className="btn"
                onClick={() => { clearAllData(); onClearData(); setConfirmClear(false); }}
                style={{ background: '#e05050', borderColor: '#e05050', color: '#fff' }}
              >Delete Everything</button>
            </div>
          </div>
        </div>
      )}
    </aside>
    </>
  );
}

function FooterBtn({ onClick, children, danger }) {
  const [hovered, setHovered] = useState(false);
  const baseColor = danger ? '#7a3030' : '#8a8680';
  const hoverColor = danger ? '#e05050' : 'var(--text)';
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: hovered ? hoverColor : baseColor, cursor: 'pointer', padding: '5px 0', background: 'none', border: 'none', textAlign: 'left', transition: 'color 0.1s', width: '100%', display: 'block' }}>
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
