import React, { useRef, useEffect, useState } from 'react';
import { getGrateful, setGrateful, getIntentions, setIntentions, getReflection, setReflection, todayKey } from '../../db';

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

export default function DailyPage({ viewDay, refresh, tick, openArchive }) {
  const today = todayKey();
  const isToday = viewDay === today;

  const [grateful, setGratefulState] = useState(() => getGrateful(viewDay).text || '');
  const [intentions, setIntentionsState] = useState(() => getIntentions(viewDay).text || '');
  const [reflection, setReflectionState] = useState(() => getReflection(viewDay).text || '');

  // Re-read when viewDay or tick changes
  useEffect(() => {
    setGratefulState(getGrateful(viewDay).text || '');
    setIntentionsState(getIntentions(viewDay).text || '');
    setReflectionState(getReflection(viewDay).text || '');
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

  const reflectionTimer = useRef(null);

  const handleReflection = (val) => {
    setReflectionState(val);
    clearTimeout(reflectionTimer.current);
    reflectionTimer.current = setTimeout(() => { setReflection(viewDay, val); refresh(); }, 400);
  };

  return (
    <div className="page">
      <div className="page-grid single">
        <div className="hide-mobile" style={{ display: 'contents' }}>
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
          <NotebookSection
            title="Reflection"
            colorVar="--c-reflection"
            label="How did today go?"
            placeholder="What happened, what you felt, what you'd do differently..."
            hint={isToday ? 'Resets at midnight · saved to archive' : 'Read-only — past day'}
            value={reflection}
            onChange={handleReflection}
            readOnly={!isToday}
            onArchive={() => openArchive('reflections')}
          />
        </div>
      </div>
    </div>
  );
}
