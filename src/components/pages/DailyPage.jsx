import React, { useRef, useEffect, useState } from 'react';
import { getGrateful, setGrateful, getIntentions, setIntentions, getReflection, addReflectionEntry, deleteReflectionEntry, todayKey } from '../../db';
import Modal from '../shared/Modal';

function ReflectionPopup({ entry, canDelete, onDelete, onClose }) {
  const stamp = entry.createdAt
    ? new Date(entry.createdAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Reflection';
  return (
    <Modal onClose={onClose} variant="center" style={{ width: 460, maxWidth: '92vw', padding: '20px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-reflection)' }}>{stamp}</div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '60vh', overflowY: 'auto' }}>
        {entry.text}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        {canDelete && (
          <button className="btn" onClick={onDelete} style={{ background: 'transparent', borderColor: '#e05050', color: '#e05050' }}>Delete</button>
        )}
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

const _reflRafs = new WeakMap();
function startReflScroll(wrapper) {
  const span = wrapper.querySelector('.refl-text-inner');
  if (!span) return;
  const max = span.scrollWidth - wrapper.clientWidth;
  if (max <= 0) return;
  const duration = 800 + max * 18;
  let t0 = null;
  const step = (ts) => {
    if (!t0) t0 = ts;
    const p = Math.min((ts - t0) / duration, 1);
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    span.style.transform = `translateX(-${e * max}px)`;
    if (p < 1) _reflRafs.set(wrapper, requestAnimationFrame(step));
  };
  _reflRafs.set(wrapper, requestAnimationFrame(step));
}
function stopReflScroll(wrapper) {
  const raf = _reflRafs.get(wrapper);
  if (raf) cancelAnimationFrame(raf);
  _reflRafs.delete(wrapper);
  const span = wrapper.querySelector('.refl-text-inner');
  if (span) span.style.transform = 'translateX(0)';
}

function NotebookSection({ title, colorVar, label, placeholder, hint, value, onChange, readOnly, onArchive }) {
  const taRef = useRef();
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = taRef.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <section className="section">
      <div className="section-hd">
        <span className="section-title" style={{ color: `var(${colorVar})` }}>{title}</span>
        <span className="section-sub">{readOnly ? '· read-only' : '· today'}</span>
      </div>
      <div className="notebook">
        <div className="nb-label">{label}</div>
        <textarea
          ref={taRef}
          className="nb-area"
          placeholder={placeholder}
          value={value}
          onChange={e => !readOnly && onChange(e.target.value)}
          readOnly={readOnly}
        />
        <div className="nb-footer">
          <span className="nb-hint">{hint}</span>
          <button className="nb-link" onClick={onArchive}>History →</button>
        </div>
      </div>
    </section>
  );
}

function ReflectionLog({ isToday, dayKey, entries, legacyText, onAdd, onDelete, onArchive }) {
  const draftKey = `tm_refl_draft_${dayKey}`;
  const [draft, setDraft] = useState('');
  const [reading, setReading] = useState(null);
  const draftRef = useRef();

  // Persist the in-progress entry per day so it survives navigation/reload
  // until it's logged. Restore whenever the viewed day changes.
  useEffect(() => {
    setDraft(isToday ? (localStorage.getItem(draftKey) || '') : '');
  }, [draftKey, isToday]);

  const updateDraft = (v) => {
    setDraft(v);
    if (!isToday) return;
    try {
      if (v) localStorage.setItem(draftKey, v);
      else localStorage.removeItem(draftKey);
    } catch { /* ignore quota/availability errors */ }
  };

  useEffect(() => {
    if (draftRef.current) {
      draftRef.current.style.height = 'auto';
      draftRef.current.style.height = draftRef.current.scrollHeight + 'px';
    }
  }, [draft]);

  const handleSubmit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  };

  const handleDraftKey = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
  };

  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  const hasLogs = sorted.length > 0 || legacyText;

  return (
    <section className="section" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="section-hd">
        <span className="section-title" style={{ color: 'var(--c-reflection)' }}>Reflections</span>
        <span className="section-sub">{isToday ? '· log' : '· read-only'}</span>
      </div>
      <div className="notebook" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
        {isToday && (
          <div className="refl-compose">
            <textarea
              ref={draftRef}
              className="refl-draft"
              placeholder="What's happening, what you're feeling, what you'd do differently..."
              value={draft}
              onChange={e => updateDraft(e.target.value)}
              onKeyDown={handleDraftKey}
              rows={5}
            />
            <button className="refl-submit" onClick={handleSubmit} disabled={!draft.trim()}>Log ↵</button>
          </div>
        )}
        {hasLogs && (
          <div className="refl-entries">
            {sorted.map(entry => {
              const timeStr = new Date(entry.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              return (
                <div key={entry.id} className="refl-entry" style={{ cursor: 'pointer' }} onClick={() => setReading(entry)}>
                  <span className="refl-time">{timeStr}</span>
                  <div
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
                    onMouseEnter={e => startReflScroll(e.currentTarget)}
                    onMouseLeave={e => stopReflScroll(e.currentTarget)}
                  >
                    <span className="refl-text-inner">{entry.text}</span>
                  </div>
                </div>
              );
            })}
            {legacyText && (
              <div className="refl-entry refl-entry-legacy" style={{ cursor: 'pointer' }} onClick={() => setReading({ text: legacyText, createdAt: null, _legacy: true })}>
                <span className="refl-time refl-legacy-label">legacy</span>
                <div
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
                  onMouseEnter={e => startReflScroll(e.currentTarget)}
                  onMouseLeave={e => stopReflScroll(e.currentTarget)}
                >
                  <span className="refl-text-inner">{legacyText}</span>
                </div>
              </div>
            )}
          </div>
        )}
        {reading && (
          <ReflectionPopup
            entry={reading}
            canDelete={isToday && !reading._legacy}
            onDelete={() => { onDelete(reading.id); setReading(null); }}
            onClose={() => setReading(null)}
          />
        )}
        <div className="nb-footer" style={{ padding: '8px 12px' }}>
          <span className="nb-hint">{isToday ? 'Cmd+Enter to log' : 'Read-only — past day'}</span>
          <button className="nb-link" onClick={onArchive}>History →</button>
        </div>
      </div>
    </section>
  );
}

export default function DailyPage({ viewDay, refresh, tick, openArchive }) {
  const today = todayKey();
  const isToday = viewDay === today;

  const [grateful, setGratefulState] = useState(() => getGrateful(viewDay).text || '');
  const [intentions, setIntentionsState] = useState(() => getIntentions(viewDay).text || '');
  const [reflectionData, setReflectionData] = useState(() => getReflection(viewDay));

  useEffect(() => {
    setGratefulState(getGrateful(viewDay).text || '');
    setIntentionsState(getIntentions(viewDay).text || '');
    setReflectionData(getReflection(viewDay));
  }, [viewDay, tick]);

  const gratefulTimer = useRef(null);
  const intentionsTimer = useRef(null);

  const handleGrateful = (val) => {
    setGratefulState(val);
    clearTimeout(gratefulTimer.current);
    gratefulTimer.current = setTimeout(() => { setGrateful(viewDay, val); refresh(); }, 400);
  };
  const handleIntentions = (val) => {
    setIntentionsState(val);
    clearTimeout(intentionsTimer.current);
    intentionsTimer.current = setTimeout(() => { setIntentions(viewDay, val); refresh(); }, 400);
  };

  const handleAddEntry    = (text) => { addReflectionEntry(viewDay, text); refresh(); };
  const handleDeleteEntry = (id)   => { deleteReflectionEntry(viewDay, id); refresh(); };

  return (
    <div className="page">
      <div className="page-grid single">
        <div className="hide-mobile">
          <NotebookSection
            title="Gratitudes"
            colorVar="--c-grateful"
            label="What I'm thankful for today"
            placeholder="Write freely — one thing, or many..."
            hint={isToday ? 'Resets at midnight · saved to archive' : 'Read-only — past day'}
            value={grateful}
            onChange={handleGrateful}
            readOnly={!isToday}
            onArchive={() => openArchive('grateful')}
          />
          <NotebookSection
            title="Intentions"
            colorVar="--c-intentions"
            label="Things I want — in any sense of the word"
            placeholder="Material things, experiences, feelings..."
            hint={isToday ? 'Saved as you type · versions in archive' : 'Read-only — past day'}
            value={intentions}
            onChange={handleIntentions}
            readOnly={!isToday}
            onArchive={() => openArchive('intentions')}
          />
        </div>
        <div id="section-reflections">
          <ReflectionLog
            isToday={isToday}
            dayKey={viewDay}
            entries={reflectionData.entries || []}
            legacyText={reflectionData._legacyText}
            onAdd={handleAddEntry}
            onDelete={handleDeleteEntry}
            onArchive={() => openArchive('reflections')}
          />
        </div>
      </div>
    </div>
  );
}
