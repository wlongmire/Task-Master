import React from 'react';
import { getGratefulDays, getGrateful, getIntentionsDays, getIntentions, getArchivedTasks, formatDateShort } from '../../db';

const TABS = ['grateful', 'intentions', 'tasks'];

function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

export default function ArchiveOverlay({ open, tab, setTab, onClose, tick }) {
  if (!open) return null;

  let content;
  if (tab === 'grateful') {
    const days = getGratefulDays();
    content = days.length === 0
      ? <div className="archive-empty">No gratitude entries yet.</div>
      : days.map(dk => {
          const entry = getGrateful(dk);
          if (!entry.text) return null;
          return (
            <div key={dk}>
              <div className="archive-group-label">{formatDateShort(dk)}</div>
              <div className="archive-entry">{entry.text}</div>
            </div>
          );
        });
  } else if (tab === 'intentions') {
    const days = getIntentionsDays();
    content = days.length === 0
      ? <div className="archive-empty">No intention entries yet.</div>
      : days.map(dk => {
          const entry = getIntentions(dk);
          if (!entry.text) return null;
          return (
            <div key={dk}>
              <div className="archive-group-label">{formatDateShort(dk)}</div>
              <div className="archive-entry">{entry.text}</div>
            </div>
          );
        });
  } else {
    const archived = getArchivedTasks();
    content = archived.length === 0
      ? <div className="archive-empty">No archived tasks.</div>
      : archived.map(t => {
          const d = t.archivedAt ? new Date(t.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          return (
            <div key={t.id} className="archive-entry">
              {t.text}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dimmer)', marginTop: 3 }}>
                {d ? `Archived ${d}` : ''}{t.state ? ` · ${t.state}` : ''}
              </div>
            </div>
          );
        });
  }

  return (
    <div className="archive-overlay open">
      <div className="archive-hd">
        <div className="archive-title">Archive</div>
        <div className="archive-close" onClick={onClose}>✕ Close</div>
      </div>
      <div className="archive-tabs">
        {TABS.map(t => (
          <div key={t} className={`archive-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>
      <div className="archive-body">{content}</div>
    </div>
  );
}
