import React, { useRef, useEffect, useState } from 'react';
import { getGrateful, setGrateful, getIntentions, setIntentions, getReflection, addReflectionEntry, deleteReflectionEntry, todayKey } from '../../db';

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

function ReflectionLog({ isToday, entries, legacyText, onAdd, onDelete, onArchive }) {
  const [draft, setDraft] = useState('');
  const draftRef = useRef();

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
              onChange={e => setDraft(e.target.value)}
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
                <div key={entry.id} className="refl-entry">
                  <span className="refl-time">{timeStr}</span>
                  <div
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
                    onMouseEnter={e => startReflScroll(e.currentTarget)}
                    onMouseLeave={e => stopReflScroll(e.currentTarget)}
                  >
                    <span className="refl-text-inner">{entry.text}</span>
                  </div>
                  {isToday && (
                    <button className="refl-delete" onClick={() => onDelete(entry.id)}>×</button>
                  )}
                </div>
              );
            })}
            {legacyText && (
              <div className="refl-entry refl-entry-legacy">
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
