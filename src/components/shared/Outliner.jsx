import React, { useState, useRef, useCallback } from 'react';
import {
  getTasks, getCategories, addTask, updateTask, moveTask,
  archiveTask, addLogEntry, todayKey
} from '../../db';

// listState: 'todo' | 'backlog' | 'inprogress'
export default function Outliner({ listState, viewDay, refresh, openLogPopup }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set()); // detail panels

  const tasks = getTasks().filter(t => {
    if (t.archived || t.state !== listState) return false;
    if (listState === 'todo') return t.dayKey === viewDay;
    return true;
  });
  const categories = getCategories();

  const toggleCat = (catId) => setCollapsed(s => { const n = new Set(s); n.has(catId) ? n.delete(catId) : n.add(catId); return n; });
  const toggleDetail = (taskId) => setExpanded(s => { const n = new Set(s); n.has(taskId) ? n.delete(taskId) : n.add(taskId); return n; });

  const handleAction = useCallback((action, taskId) => {
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
    } else if (action === 'toggle-urgent') {
      updateTask(taskId, { urgent: !task.urgent });
      refresh();
    }
  }, [viewDay, refresh, openLogPopup]);

  const handleTextChange = useCallback((taskId, text) => {
    updateTask(taskId, { text });
  }, []);

  const handleNewTask = useCallback((catId) => {
    const now = Date.now();
    addTask({ text: '', state: listState, categoryId: catId || null, dayKey: listState === 'todo' ? viewDay : undefined });
    refresh();
  }, [listState, viewDay, refresh]);

  // Group by category
  const uncategorized = tasks.filter(t => !t.categoryId);
  const catGroups = categories.map(cat => ({
    cat,
    tasks: tasks.filter(t => t.categoryId === cat.id),
  })).filter(g => g.tasks.length > 0);

  // Auto-collapse empty categories (ones with no tasks in this state)
  const allCatsWithTasks = new Set(tasks.map(t => t.categoryId).filter(Boolean));

  return (
    <div className="outliner">
      {/* Uncategorized tasks */}
      {uncategorized.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          listState={listState}
          depth={0}
          expanded={expanded.has(task.id)}
          onToggleDetail={() => toggleDetail(task.id)}
          onAction={handleAction}
          onTextChange={handleTextChange}
        />
      ))}

      {/* Categorized groups */}
      {catGroups.map(({ cat, tasks: catTasks }) => (
        <div key={cat.id}>
          {/* Category header */}
          <div className="o-row" onClick={() => toggleCat(cat.id)} style={{ marginTop: uncategorized.length > 0 || catGroups.indexOf({ cat, tasks: catTasks }) > 0 ? 6 : 0 }}>
            <div className={`o-chev${collapsed.has(cat.id) ? ' collapsed' : ''}`}>▾</div>
            <div className="o-body" style={{ paddingLeft: 2 }}>
              <input
                className={`o-input is-cat ${listState}`}
                defaultValue={cat.name}
                onClick={e => e.stopPropagation()}
                onBlur={e => updateTask(cat.id, { name: e.target.value })}
              />
            </div>
          </div>

          {/* Category children */}
          {!collapsed.has(cat.id) && catTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              listState={listState}
              depth={1}
              expanded={expanded.has(task.id)}
              onToggleDetail={() => toggleDetail(task.id)}
              onAction={handleAction}
              onTextChange={handleTextChange}
            />
          ))}
        </div>
      ))}

      {tasks.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ccc', padding: '12px 4px' }}>
          Nothing here yet.
        </div>
      )}

      <div className="o-add" onClick={() => handleNewTask(null)}>
        <div className={`o-add-plus ${listState}`}>+</div>
        <div className="o-add-label">
          {listState === 'todo' ? 'Add task...' : listState === 'backlog' ? 'Add to backlog...' : 'Start something...'}
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, listState, depth, expanded, onToggleDetail, onAction, onTextChange }) {
  const lastLog = task.log && task.log.length > 0 ? task.log[task.log.length - 1] : null;
  const logCount = task.log ? task.log.length : 0;

  return (
    <>
      <div className="o-row" data-depth={depth || undefined}>
        <div
          className={`o-check${task.done ? ' done' : ''}`}
          onClick={onToggleDetail}
          title="View activity log"
        />
        <div className="o-body">
          <input
            className={`o-input${task.done ? ' is-done' : ''}`}
            defaultValue={task.text}
            placeholder="Task..."
            onBlur={e => onTextChange(task.id, e.target.value)}
          />
          {task.urgent && <span className="urgent-badge">! URGENT</span>}
          {lastLog?.note && !expanded && (
            <div className="o-log-note">{lastLog.note}</div>
          )}
          {task.dueDate && (
            <div className="o-meta">Due {task.dueDate}</div>
          )}
        </div>
        <div className="o-actions">
          {logCount > 0 && (
            <button className="o-act log-count" onClick={onToggleDetail} title="Activity log">
              ≡ {logCount}
            </button>
          )}
          {listState === 'backlog' && (
            <button className="o-act promote" onClick={() => onAction('promote', task.id)}>↑ To Do</button>
          )}
          {listState === 'todo' && (
            <>
              <button className="o-act start" onClick={() => onAction('start', task.id)}>▶ Start</button>
              <button className="o-act" onClick={() => onAction('defer', task.id)}>↓ Defer</button>
            </>
          )}
          {listState === 'inprogress' && (
            <>
              <button className="o-act progress" onClick={() => onAction('log-progress', task.id)}>◐ Progress</button>
              <button className="o-act done-btn" onClick={() => onAction('done', task.id)}>✓ Done</button>
              <button className="o-act" onClick={() => onAction('back', task.id)}>← Back</button>
            </>
          )}
          {listState !== 'inprogress' && (
            <button className="o-act done-btn" onClick={() => onAction('done', task.id)}>✓ Done</button>
          )}
          <button className="o-act" onClick={() => onAction('archive', task.id)}>Archive</button>
        </div>
      </div>

      {expanded && <DetailPanel task={task} />}
    </>
  );
}

function DetailPanel({ task }) {
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
