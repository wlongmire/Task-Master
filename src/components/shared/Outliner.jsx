import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  getTasks, getCategories, addTask, insertTaskAfter, updateTask, moveTask,
  archiveTask, deleteTask, addLogEntry, todayKey
} from '../../db';

// Survives remounts — stores the task ID to focus after next render
let _pendingFocus = null;
export function scheduleOutlinerFocus(taskId) { _pendingFocus = taskId; }

function useIsMobile() {
  const [v, setV] = useState(() => window.innerWidth <= 600);
  useEffect(() => {
    const h = () => setV(window.innerWidth <= 600);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

// listState: 'todo' | 'backlog' | 'inprogress'
export default function Outliner({ listState, viewDay, refresh, openLogPopup, onEnd, onStart }) {
  const isMobile = useIsMobile();
  const [addModal, setAddModal]   = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null); // mobile tap-to-reveal
  const outlinerBlurTimer = useRef();
  const [collapsed, setCollapsed] = useState(() => {
    const cats = getCategories();
    const allTasks = getTasks().filter(t => !t.archived && t.state === listState);
    return new Set(cats.filter(c => !allTasks.some(t => t.categoryId === c.id)).map(c => c.id));
  });
  const [expanded, setExpanded] = useState(new Set()); // detail panels
  const containerRef = useRef();

  // After every render, check if we need to focus/scroll to a task
  useEffect(() => {
    if (!_pendingFocus || !containerRef.current) return;
    const el = containerRef.current.querySelector(`textarea[data-task-id="${_pendingFocus}"], input[data-task-id="${_pendingFocus}"]`);
    if (el) {
      if (isMobile) {
        // Don't focus (would re-open keyboard); just scroll the row into view
        const row = el.closest('.o-row') ?? el;
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.focus();
        const len = el.value?.length ?? 0;
        try { el.setSelectionRange(len, len); } catch (_) {}
      }
      _pendingFocus = null;
    }
  });

  const tasks = getTasks().filter(t => {
    if (t.archived || t.state !== listState) return false;
    if (listState === 'todo') return t.dayKey === viewDay;
    return true;
  });
  const categories = getCategories();

  const toggleCat = (catId) => setCollapsed(s => { const n = new Set(s); n.has(catId) ? n.delete(catId) : n.add(catId); return n; });

  const toggleDetail = (taskId) => setExpanded(s => { const n = new Set(s); n.has(taskId) ? n.delete(taskId) : n.add(taskId); return n; });

  const handleDelete = useCallback((taskId) => {
    if (!containerRef.current) return;
    const nodes = [...containerRef.current.querySelectorAll('input[data-task-id], [data-add-cat]')];
    const idx = nodes.findIndex(n => n.dataset.taskId === taskId);
    const prev = idx > 0 ? nodes[idx - 1] : null;
    deleteTask(taskId);
    if (prev) {
      if (prev.dataset.taskId) {
        _pendingFocus = prev.dataset.taskId;
      } else {
        // It's an add row — focus it directly after delete + refresh
        const addCat = prev.dataset.addCat;
        setTimeout(() => {
          const el = containerRef.current?.querySelector(`[data-add-cat="${addCat}"]`);
          if (el) el.focus();
        }, 0);
      }
    }
    refresh();
  }, [refresh]);

  const focusNode = (node) => {
    if (!node) return;
    node.focus();
    if (node.setSelectionRange) node.setSelectionRange(node.value?.length ?? 0, node.value?.length ?? 0);
  };

  const expandAndEnter = useCallback((topicId) => {
    setCollapsed(s => { const n = new Set(s); n.delete(topicId); return n; });
    const topicTask = tasks.find(t => !t.archived && t.state === listState && t.categoryId === topicId && (listState !== 'todo' || t.dayKey === viewDay));
    if (topicTask) { _pendingFocus = topicTask.id; }
    else { setTimeout(() => containerRef.current?.querySelector(`[data-add-cat="${topicId}"]`)?.focus(), 30); }
  }, [tasks, listState, viewDay, setCollapsed]);

  const collapseAndLeave = useCallback((topicId, dir) => {
    setCollapsed(s => { const n = new Set(s); n.add(topicId); return n; });
    setTimeout(() => {
      if (!containerRef.current) return;
      const nodes = [...containerRef.current.querySelectorAll('input[data-task-id], [data-add-cat]')];
      const addRow = containerRef.current.querySelector(`[data-add-cat="${topicId}"]`);
      // After collapse, add row is gone — find the item just before/after where it was
      const allWithHeaders = [...containerRef.current.querySelectorAll('input[data-task-id], [data-add-cat], [data-topic-id]')];
      const header = containerRef.current.querySelector(`[data-topic-id="${topicId}"]`);
      const headerIdx = allWithHeaders.indexOf(header);
      if (dir === 'down') {
        const after = allWithHeaders.slice(headerIdx + 1).find(n => n.dataset.taskId || (n.dataset.addCat && n.dataset.addCat !== topicId));
        focusNode(after);
      } else {
        const before = [...allWithHeaders.slice(0, headerIdx)].reverse().find(n => n.dataset.taskId || n.dataset.addCat);
        focusNode(before);
      }
    }, 30);
  }, [setCollapsed]);

  const handleArrow = useCallback((taskId, dir) => {
    if (!containerRef.current) return;
    const allNodes = [...containerRef.current.querySelectorAll('input[data-task-id], [data-add-cat], [data-topic-id]')];
    const visNodes = [...containerRef.current.querySelectorAll('input[data-task-id], [data-add-cat]')];
    const visIdx = visNodes.findIndex(n => n.dataset.taskId === taskId);
    if (visIdx === -1) return;

    if (dir === 'down') {
      const next = visNodes[visIdx + 1];
      const curAllIdx = allNodes.findIndex(n => n.dataset.taskId === taskId);
      const nextAllIdx = next ? allNodes.indexOf(next) : allNodes.length;
      const collapsedHeader = allNodes.slice(curAllIdx + 1, nextAllIdx).find(n => n.dataset.topicId);
      if (collapsedHeader) { expandAndEnter(collapsedHeader.dataset.topicId); return; }
      if (!next) { onEnd?.(); return; }
      focusNode(next);
    } else {
      if (visIdx === 0) { onStart?.(); return; }
      focusNode(visNodes[visIdx - 1]);
    }
  }, [expandAndEnter, onEnd, onStart]);

  const handleAddRowArrow = useCallback((catId, dir) => {
    if (!containerRef.current) return;
    const allNodes = [...containerRef.current.querySelectorAll('input[data-task-id], [data-add-cat], [data-topic-id]')];
    const visNodes = [...containerRef.current.querySelectorAll('input[data-task-id], [data-add-cat]')];
    const current = containerRef.current.querySelector(`[data-add-cat="${catId}"]`);
    const visIdx = visNodes.indexOf(current);

    if (dir === 'down') {
      // If this is an empty topic, collapse it and move on
      const hasTasks = catId !== 'none' && tasks.some(t => !t.archived && t.categoryId === catId && t.state === listState && (listState !== 'todo' || t.dayKey === viewDay));
      if (catId !== 'none' && !hasTasks) { collapseAndLeave(catId, 'down'); return; }
      // Check for collapsed topic header after this add row
      const curAllIdx = allNodes.indexOf(current);
      const next = visNodes[visIdx + 1];
      const nextAllIdx = next ? allNodes.indexOf(next) : allNodes.length;
      const collapsedHeader = allNodes.slice(curAllIdx + 1, nextAllIdx).find(n => n.dataset.topicId);
      if (collapsedHeader) { expandAndEnter(collapsedHeader.dataset.topicId); return; }
      if (!next) { onEnd?.(); return; }
      focusNode(next);
    } else {
      if (visIdx === 0) { onStart?.(); return; }
      focusNode(visNodes[visIdx - 1]);
    }
  }, [tasks, listState, viewDay, expandAndEnter, collapseAndLeave, onEnd, onStart]);

  const handleEnter = useCallback((taskId, catId) => {
    const newTask = insertTaskAfter(taskId, {
      text: '', state: listState,
      categoryId: catId || null,
      dayKey: listState === 'todo' ? viewDay : undefined,
    });
    _pendingFocus = newTask.id;
    refresh();
  }, [listState, viewDay, refresh]);

  const handleAction = useCallback((action, taskId) => {
    if (action === '_refresh') { refresh(); return; }
    const task = getTasks().find(t => t.id === taskId);
    if (!task) return;

    if (action === 'start') {
      addLogEntry(taskId, { type: 'started' });
      moveTask(taskId, 'inprogress');
      refresh();
    } else if (action === 'promote') {
      updateTask(taskId, { state: 'todo', dayKey: viewDay });
      refresh();
    } else if (action === 'defer') {
      updateTask(taskId, { state: 'backlog', dayKey: undefined });
      refresh();
    } else if (action === 'back') {
      updateTask(taskId, { state: 'todo', dayKey: viewDay });
      refresh();
    } else if (action === 'log-progress') {
      openLogPopup(taskId, 'progress', (note) => {
        addLogEntry(taskId, { type: 'progress', note });
        refresh();
      });
    } else if (action === 'done') {
      openLogPopup(taskId, 'done', (note) => {
        addLogEntry(taskId, { type: 'done', note });
        moveTask(taskId, 'completed');
        refresh();
      });
    } else if (action === 'archive') {
      archiveTask(taskId);
      refresh();
    } else if (action === 'delete') {
      deleteTask(taskId);
      refresh();
    } else if (action === 'toggle-urgent') {
      updateTask(taskId, { urgent: !task.urgent });
      refresh();
    }
  }, [viewDay, refresh, openLogPopup]);

  const handleTextChange = useCallback((taskId, text) => {
    updateTask(taskId, { text });
  }, []);

  const handleNewTask = useCallback((catId, initialText = '') => {
    const newTask = addTask({ text: initialText, state: listState, categoryId: catId || null, dayKey: listState === 'todo' ? viewDay : undefined });
    _pendingFocus = newTask.id;
    refresh();
  }, [listState, viewDay, refresh]);

  // Group by category — show all topics even if empty
  const uncategorized = tasks.filter(t => !t.categoryId);
  const catGroups = categories.map(cat => ({
    cat,
    tasks: tasks.filter(t => t.categoryId === cat.id),
  })).sort((a, b) => {
    const score = ({ tasks: ts }) => {
      if (ts.some(t => t.urgent))  return 0;
      if (ts.some(t => t.dueDate)) return 1;
      if (ts.length > 0)           return 2;
      return 3; // empty topics last
    };
    return score(a) - score(b);
  });

  const addLabel = listState === 'todo' ? 'Add task...' : listState === 'backlog' ? 'Add to backlog...' : 'Start something...';

  const handleOutlinerBlur = () => {
    outlinerBlurTimer.current = setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) setActiveTaskId(null);
    }, 150);
  };
  const handleOutlinerFocus = () => clearTimeout(outlinerBlurTimer.current);

  return (
    <div className="outliner" ref={containerRef} onBlur={handleOutlinerBlur} onFocus={handleOutlinerFocus}>
      {/* Uncategorized tasks */}
      {uncategorized.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          listState={listState}
          depth={0}
          isMobile={isMobile}
          isActive={activeTaskId === task.id}
          onActivate={() => setActiveTaskId(task.id)}
          expanded={expanded.has(task.id)}
          onToggleDetail={() => toggleDetail(task.id)}
          onAction={handleAction}
          onDelete={handleDelete}
          onEnter={handleEnter}
          onArrow={handleArrow}
          onTextChange={handleTextChange}
        />
      ))}

      {/* Uncategorized add row */}
      <div className="o-add" tabIndex={0} data-add-cat="none"
        onClick={() => isMobile ? setAddModal({ catId: null }) : handleNewTask(null)}
        onKeyDown={e => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); handleAddRowArrow('none', e.key === 'ArrowUp' ? 'up' : 'down'); }
          else if (e.key === 'Enter') { e.preventDefault(); isMobile ? setAddModal({ catId: null }) : handleNewTask(null); }
          else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); isMobile ? setAddModal({ catId: null }) : handleNewTask(null, e.key); }
        }}>
        <div className={`o-add-plus ${listState}`}>+</div>
        <div className="o-add-label">{addLabel}</div>
      </div>

      {/* Topic groups */}
      {catGroups.map(({ cat, tasks: catTasks }) => (
        <div key={cat.id} style={{ marginTop: 10 }}>
          {/* Topic header */}
          <div className="o-row" data-topic-id={collapsed.has(cat.id) ? cat.id : undefined} onClick={() => toggleCat(cat.id)}>
            <div className={`o-chev${collapsed.has(cat.id) ? ' collapsed' : ''}`}>▾</div>
            <div className="o-body" style={{ paddingLeft: 2 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>
                {cat.name}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dimmer)', marginLeft: 'auto' }}>
              {catTasks.length || ''}
            </span>
          </div>

          {/* Topic tasks + add row */}
          {!collapsed.has(cat.id) && (
            <>
              {catTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  listState={listState}
                  depth={1}
                  isMobile={isMobile}
                  isActive={activeTaskId === task.id}
                  onActivate={() => setActiveTaskId(task.id)}
                  expanded={expanded.has(task.id)}
                  onToggleDetail={() => toggleDetail(task.id)}
                  onAction={handleAction}
                  onDelete={handleDelete}
                  onEnter={handleEnter}
                  onArrow={handleArrow}
                  onTextChange={handleTextChange}
                />
              ))}
              <div className="o-add" style={{ paddingLeft: 36 }} tabIndex={0} data-add-cat={cat.id}
                onClick={() => isMobile ? setAddModal({ catId: cat.id }) : handleNewTask(cat.id)}
                onKeyDown={e => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); handleAddRowArrow(cat.id, e.key === 'ArrowUp' ? 'up' : 'down'); }
                  else if (e.key === 'Enter') { e.preventDefault(); isMobile ? setAddModal({ catId: cat.id }) : handleNewTask(cat.id); }
                  else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); isMobile ? setAddModal({ catId: cat.id }) : handleNewTask(cat.id, e.key); }
                }}>
                <div className={`o-add-plus ${listState}`}>+</div>
                <div className="o-add-label">{addLabel}</div>
              </div>
            </>
          )}
        </div>
      ))}

      {addModal && (
        <AddTaskModal
          listState={listState}
          catId={addModal.catId}
          categories={categories}
          onAdd={(text, catId, extras) => {
            const newTask = addTask({ text, state: listState, categoryId: catId || null, dayKey: listState === 'todo' ? viewDay : undefined, ...extras });
            _pendingFocus = newTask.id;
            refresh();
            setAddModal(null);
          }}
          onClose={() => setAddModal(null)}
        />
      )}
    </div>
  );
}

function AddTaskModal({ listState, catId, categories, onAdd, onClose }) {
  const [text, setText]             = useState('');
  const [description, setDesc]      = useState('');
  const [selectedCat, setSelectedCat] = useState(catId || '');
  const [dueDate, setDueDate]       = useState('');
  const [urgent, setUrgent]         = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const inputRef = useRef();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!text.trim()) return;
    const extras = {
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(urgent ? { urgent: true } : {}),
    };
    onAdd(text.trim(), selectedCat || null, extras);
  };

  const stateLabel = listState === 'todo' ? 'To Do' : listState === 'backlog' ? 'Backlog' : 'In Progress';
  const accentColor = listState === 'todo' ? 'var(--c-todo)' : listState === 'backlog' ? 'var(--c-backlog)' : 'var(--c-inprogress)';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 'calc(100% - 32px)', zIndex: 101,
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 16, padding: '20px 20px 28px',
        display: 'flex', flexDirection: 'column', gap: 12,
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>
          Add to {stateLabel}
        </div>

        {/* Task name */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What needs doing?"
          rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } if (e.key === 'Escape') onClose(); }}
          style={{
            width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-ui)',
            fontSize: 18, padding: '12px 14px', outline: 'none', resize: 'none', lineHeight: 1.5,
          }}
        />

        {/* Topic picker */}
        {categories.length > 0 && (
          <select
            value={selectedCat}
            onChange={e => setSelectedCat(e.target.value)}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8,
              color: selectedCat ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-ui)',
              fontSize: 15, padding: '10px 14px', outline: 'none', colorScheme: 'dark', width: '100%',
            }}
          >
            <option value="">No topic</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {/* Details toggle */}
        <button
          onClick={() => setShowDetails(d => !d)}
          style={{
            alignSelf: 'flex-start', fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: showDetails ? 'var(--text-dim)' : 'var(--text-dimmer)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>{showDetails ? '▾' : '▸'}</span> Details
        </button>

        {/* Collapsible details */}
        {showDetails && (
          <>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Description (optional)..."
              rows={2}
              style={{
                width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)',
                borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-ui)',
                fontSize: 14, padding: '10px 14px', outline: 'none', resize: 'none', lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmer)' }}>Due date</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8,
                    color: dueDate ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)',
                    fontSize: 14, padding: '10px 14px', outline: 'none', colorScheme: 'dark', width: '100%',
                  }}
                />
              </div>
              <button
                onClick={() => setUrgent(u => !u)}
                style={{
                  marginTop: 18, width: 44, height: 44, borderRadius: 8, border: '1px solid',
                  borderColor: urgent ? '#e05050' : 'var(--border2)',
                  background: urgent ? '#e0505022' : 'var(--surface2)',
                  color: urgent ? '#e05050' : 'var(--text-dimmer)',
                  fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >!</button>
            </div>
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500,
            padding: '12px', borderRadius: 8, border: '1px solid var(--border2)',
            background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} style={{
            flex: 2, fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600,
            padding: '12px', borderRadius: 8, border: 'none',
            background: accentColor, color: '#000', cursor: 'pointer',
          }}>Add Task</button>
        </div>
      </div>
    </>
  );
}

function TaskRow({ task, listState, depth, isMobile, isActive, onActivate, expanded, onToggleDetail, onAction, onDelete, onEnter, onArrow, onTextChange }) {
  const lastLog = task.log && task.log.length > 0 ? task.log[task.log.length - 1] : null;
  const wrapperRef = useRef();
  const inputRef = useRef();
  const scrollRaf = useRef();
  const [detailModal, setDetailModal] = useState(false);

  const startScroll = useCallback(() => {
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const duration = 800 + max * 18;
    let t0 = null;
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      el.scrollLeft = e * max;
      if (p < 1) scrollRaf.current = requestAnimationFrame(step);
    };
    scrollRaf.current = requestAnimationFrame(step);
  }, []);

  const stopScroll = useCallback(() => {
    cancelAnimationFrame(scrollRaf.current);
    if (inputRef.current) inputRef.current.scrollLeft = 0;
  }, []);

  return (
    <div ref={wrapperRef}
      className={isMobile && isActive ? 'task-row-active' : ''}
      onFocus={isMobile ? onActivate : undefined}
      onKeyDown={e => { if (e.key === 'Escape' && expanded) onToggleDetail(); }}
    >
      <div className="o-row o-task-row" data-depth={depth || undefined}
        onPointerDown={isMobile ? () => { onActivate(); setTimeout(() => inputRef.current?.focus(), 0); } : undefined}
        onMouseEnter={!isMobile ? startScroll : undefined}
        onMouseLeave={!isMobile ? stopScroll : undefined}
      >
        {depth > 0 && <span className="o-bullet" style={{ width: 14, flexShrink: 0, textAlign: 'center', fontSize: 16, lineHeight: '30px', color: 'var(--text-dimmer)', userSelect: 'none', marginLeft: -4 }}>·</span>}
        <div className={`o-check${task.done ? ' done' : ''}`} onClick={e => { e.stopPropagation(); onToggleDetail(); }} title="View activity log" />
        <div className="o-body">
          <textarea
            ref={inputRef}
            className={`o-input${task.done ? ' is-done' : ''}`}
            data-task-id={task.id}
            defaultValue={task.text}
            placeholder="Task..."
            rows={1}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
            onFocus={e => { stopScroll(); e.target.style.whiteSpace = 'normal'; e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
            onBlur={e => { stopScroll(); e.target.style.whiteSpace = 'nowrap'; e.target.style.height = ''; onTextChange(task.id, e.target.value); }}
            onKeyDown={e => {
              if (e.key === 'Backspace' && e.target.value === '') { e.preventDefault(); onDelete(task.id); }
              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onTextChange(task.id, e.target.value); onEnter(task.id, task.categoryId || null); }
              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onArrow(task.id, e.key === 'ArrowUp' ? 'up' : 'down'); }
            }}
          />
          {task.dueDate && (
            <div className="o-meta" style={{ color: task.dueDate < todayKey() ? 'var(--c-todo)' : 'var(--text-dimmer)' }}>
              Due {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
        <div className="o-actions">
            {isMobile ? (
              <>
                {listState === 'backlog' && <button className="o-act promote" onMouseDown={e => e.preventDefault()} onClick={() => onAction('promote', task.id)}>↑ To Do</button>}
                {listState === 'todo' && <><button className="o-act start" onMouseDown={e => e.preventDefault()} onClick={() => onAction('start', task.id)}>▶ Start</button><button className="o-act done-btn" onMouseDown={e => e.preventDefault()} onClick={() => onAction('done', task.id)}>✓ Done</button><button className="o-act" onMouseDown={e => e.preventDefault()} onClick={() => onAction('defer', task.id)}>← Back</button></>}
                {listState === 'inprogress' && <><button className="o-act progress" onMouseDown={e => e.preventDefault()} onClick={() => onAction('log-progress', task.id)}>◐ Progress</button><button className="o-act done-btn" onMouseDown={e => e.preventDefault()} onClick={() => onAction('done', task.id)}>✓ Done</button><button className="o-act" onMouseDown={e => e.preventDefault()} onClick={() => onAction('back', task.id)}>← Back</button></>}
                {listState === 'backlog' && <button className="o-act done-btn" onMouseDown={e => e.preventDefault()} onClick={() => onAction('done', task.id)}>✓ Done</button>}
                <button className="o-act o-act-details" onMouseDown={e => e.preventDefault()} onClick={() => setDetailModal(true)}>Details</button>
                <button className="o-act o-act-delete" onMouseDown={e => e.preventDefault()} onClick={() => onDelete(task.id)}>✕ Delete</button>
              </>
            ) : (
              <>
                {task.log?.length > 0 && <button className="o-act log-count" onClick={onToggleDetail} title="Activity log">≡ {task.log.length}</button>}
                {listState === 'backlog' && <button className="o-act promote" onClick={() => onAction('promote', task.id)}>↑ To Do</button>}
                {listState === 'todo' && <><button className="o-act start" onClick={() => onAction('start', task.id)}>▶ Start</button><button className="o-act done-btn" onClick={() => onAction('done', task.id)}>✓ Done</button><button className="o-act" onClick={() => onAction('defer', task.id)}>← Back</button></>}
                {listState === 'inprogress' && <><button className="o-act progress" onClick={() => onAction('log-progress', task.id)}>◐ Progress</button><button className="o-act done-btn" onClick={() => onAction('done', task.id)}>✓ Done</button><button className="o-act" onClick={() => onAction('back', task.id)}>← Back</button></>}
                {listState === 'backlog' && <button className="o-act done-btn" onClick={() => onAction('done', task.id)}>✓ Done</button>}
                <button className="o-act" onClick={() => onAction('archive', task.id)}>Archive</button>
              </>
            )}
          </div>
        {lastLog?.note && !expanded && (
          <div className="o-log-note-row">
            <span className="o-log-note-spacer" />
            <span className="o-log-note">{lastLog.note}</span>
          </div>
        )}
      </div>

      {!isMobile && expanded && <DetailPanel task={task} onAction={onAction} />}
      {detailModal && <TaskDetailModal task={task} listState={listState} onAction={onAction} onClose={() => setDetailModal(false)} />}
    </div>
  );
}

const LOG_TYPE_LABELS = { created: 'Created', started: 'Started', progress: 'Progress', done: 'Done' };
const LOG_TYPE_COLORS = { created: 'var(--text-dimmer)', started: 'var(--c-backlog)', progress: 'var(--c-inprogress)', done: 'var(--c-completed)' };

function TaskDetailModal({ task, listState, onAction, onClose }) {
  const [text, setText] = useState(task.text);
  const [description, setDesc] = useState(task.description || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const accentColor = listState === 'todo' ? 'var(--c-todo)' : listState === 'backlog' ? 'var(--c-backlog)' : 'var(--c-inprogress)';

  const save = () => {
    if (text.trim()) updateTask(task.id, { text: text.trim() });
    updateTask(task.id, { description: description.trim() || null, dueDate: dueDate || null });
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 'calc(100% - 32px)', zIndex: 101, maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 16, padding: '20px 20px 28px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>
          Task Details
        </div>

        {/* Name */}
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 18, padding: '12px 14px', outline: 'none', resize: 'none', lineHeight: 1.5 }} />

        {/* Description */}
        <textarea value={description} onChange={e => setDesc(e.target.value)} placeholder="Description..." rows={3}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '10px 14px', outline: 'none', resize: 'none', lineHeight: 1.5 }} />

        {/* Due date + urgent */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmer)' }}>Due date</span>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, color: dueDate ? 'var(--text)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 14px', outline: 'none', colorScheme: 'dark', width: '100%' }} />
          </div>
          <button onClick={() => { onAction('toggle-urgent', task.id); }}
            style={{ marginTop: 18, width: 44, height: 44, borderRadius: 8, border: '1px solid', borderColor: task.urgent ? '#e05050' : 'var(--border2)', background: task.urgent ? '#e0505022' : 'var(--surface2)', color: task.urgent ? '#e05050' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>!</button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {listState === 'backlog' && <button className="o-act promote" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('promote', task.id); onClose(); }}>↑ To Do</button>}
          {listState === 'todo' && <><button className="o-act start" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('start', task.id); onClose(); }}>▶ Start</button><button className="o-act done-btn" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('done', task.id); onClose(); }}>✓ Done</button><button className="o-act" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('defer', task.id); onClose(); }}>← Back</button></>}
          {listState === 'inprogress' && <><button className="o-act progress" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('log-progress', task.id); onClose(); }}>◐ Progress</button><button className="o-act done-btn" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('done', task.id); onClose(); }}>✓ Done</button><button className="o-act" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('back', task.id); onClose(); }}>← Back</button></>}
          {listState === 'backlog' && <button className="o-act done-btn" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => { onAction('done', task.id); onClose(); }}>✓ Done</button>}
          <button className="o-act" style={{ fontSize: 13, padding: '8px 14px', marginLeft: 'auto', color: '#7a3030', borderColor: '#7a3030' }} onClick={() => { onAction('archive', task.id); onClose(); }}>Archive</button>
        </div>

        {/* Activity log */}
        {task.log?.length > 0 && (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 12 }}>Activity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...task.log].reverse().map(entry => (
                <div key={entry.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: LOG_TYPE_COLORS[entry.type] || 'var(--text-dimmer)', flexShrink: 0 }}>{LOG_TYPE_LABELS[entry.type] || entry.type}</span>
                  {entry.note && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-dim)', flex: 1 }}>{entry.note}</span>}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dimmer)', flexShrink: 0 }}>{new Date(entry.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Save / close */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500, padding: '12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} style={{ flex: 2, fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, padding: '12px', borderRadius: 8, border: 'none', background: accentColor, color: '#000', cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </>
  );
}

function DetailPanel({ task, onAction }) {
  const LOG_TYPE_LABELS = { created: 'Created', started: 'Started', progress: 'Progress', done: 'Done' };

  return (
    <div className="detail-panel">
      <textarea
        className="detail-desc"
        rows={2}
        placeholder="Add description..."
        defaultValue={task.description || ''}
        onBlur={e => updateTask(task.id, { description: e.target.value })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmer)' }}>Due</span>
          <input
            type="date"
            defaultValue={task.dueDate || ''}
            onBlur={e => updateTask(task.id, { dueDate: e.target.value || null })}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: task.dueDate ? 'inherit' : 'var(--text-dimmer)',
              background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer',
              colorScheme: 'dark',
            }}
          />
          {task.dueDate && (
            <button
              onClick={() => updateTask(task.id, { dueDate: null })}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dimmer)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => e.target.style.color = 'var(--text)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-dimmer)'}
            >✕ clear</button>
          )}
        </div>

        <button
          onClick={() => onAction('toggle-urgent', task.id)}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            width: 22, height: 22, borderRadius: 3, cursor: 'pointer', border: '1px solid',
            background: 'transparent',
            borderColor: task.urgent ? '#e05050' : 'var(--border2)',
            color: task.urgent ? '#e05050' : 'var(--text-dimmer)',
            transition: 'all 0.1s', flexShrink: 0,
          }}
        >!</button>

        <button
          onClick={() => onAction('delete', task.id)}
          style={{
            marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9,
            letterSpacing: '0.08em', color: '#7a3030', background: 'none',
            border: 'none', cursor: 'pointer', padding: '2px 4px', transition: 'color 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#e05050'}
          onMouseLeave={e => e.currentTarget.style.color = '#7a3030'}
        >✕ delete</button>

      </div>
      {task.log && task.log.length > 0 && (
        <>
          <div className="log-header">Activity</div>
          <div className="log-scroll">
            {[...task.log].reverse().map(entry => (
              <div key={entry.id} className="log-entry">
                <span className={`log-type ${entry.type}`}>{LOG_TYPE_LABELS[entry.type] || entry.type}</span>
                {entry.note && <span className="log-note">{entry.note}</span>}
                <span className="log-time">{new Date(entry.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
