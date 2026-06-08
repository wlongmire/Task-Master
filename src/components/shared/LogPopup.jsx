import React, { useState, useRef, useEffect } from 'react';
import { getTasks } from '../../db';
import Modal from './Modal';

export default function LogPopup({ taskId, title: titleProp, type, onDone, onCancel }) {
  const [note, setNote] = useState('');
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);

  const task = taskId ? getTasks().find(t => t.id === taskId) : null;
  const displayTitle = titleProp || task?.text || '';
  const isDone = type === 'done';
  const eyebrow = isDone ? '✓ Complete' : '◐ Log progress';
  const placeholder = isDone ? 'Add a note (optional)...' : 'What progress did you make? (optional)';

  const handleSubmit = () => {
    onDone(note.trim() || null);
  };

  return (
    <Modal onClose={onCancel}>
      <div className="popup-eyebrow">{eyebrow}</div>
      <div className="popup-title">{displayTitle}</div>
      <textarea
        ref={ref}
        className="popup-textarea"
        rows={3}
        placeholder={placeholder}
        value={note}
        onChange={e => setNote(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
      />
      <div className="popup-actions">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={handleSubmit}>
          {isDone ? '✓ Complete' : '◐ Log'}
        </button>
      </div>
    </Modal>
  );
}
