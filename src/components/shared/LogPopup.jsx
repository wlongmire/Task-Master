import React, { useState, useRef, useEffect } from 'react';
import { getTasks } from '../../db';

export default function LogPopup({ taskId, type, onDone, onCancel }) {
  const [note, setNote] = useState('');
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);

  const task = getTasks().find(t => t.id === taskId);
  const isDone = type === 'done';
  const eyebrow = isDone ? '✓ Complete task' : '◐ Log progress';
  const placeholder = isDone ? 'Add a note (optional)...' : 'What progress did you make?';

  const handleSubmit = () => {
    if (!isDone && !note.trim()) return;
    onDone(note.trim() || null);
  };

  return (
    <div className="popup-overlay" onClick={onCancel}>
      <div className="popup" onClick={e => e.stopPropagation()}>
        <div className="popup-eyebrow">{eyebrow}</div>
        <div className="popup-title">{task?.text || ''}</div>
        <textarea
          ref={ref}
          className="popup-textarea"
          rows={3}
          placeholder={placeholder}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); if (e.key === 'Escape') onCancel(); }}
        />
        <div className="popup-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={handleSubmit}>
            {isDone ? '✓ Complete' : '◐ Log'}
          </button>
        </div>
      </div>
    </div>
  );
}
