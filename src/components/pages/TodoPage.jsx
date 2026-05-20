import React from 'react';
import Outliner, { scheduleOutlinerFocus } from '../shared/Outliner';
import { getTasks } from '../../db';

export default function TodoPage({ viewDay, refresh, tick, openArchive, openLogPopup, onPageEnd, onPageStart }) {
  const firstOf = (state) => getTasks().filter(t => !t.archived && t.state === state && (state !== 'todo' || t.dayKey === viewDay))[0]?.id;
  const lastOf  = (state) => { const t = getTasks().filter(t => !t.archived && t.state === state && (state !== 'todo' || t.dayKey === viewDay)); return t[t.length - 1]?.id; };

  return (
    <div className="page">
      <div className="page-grid">
        <section className="section hide-mobile" id="section-backlog">
          <div className="section-hd">
            <span className="section-title backlog">Backlog</span>
            <span className="section-sub">· up next</span>
          </div>
          <Outliner
            key={`backlog-${tick}`}
            listState="backlog"
            viewDay={viewDay}
            refresh={refresh}
            openLogPopup={openLogPopup}
            onEnd={() => { const id = firstOf('todo'); if (id) scheduleOutlinerFocus(id); refresh(); }}
            onStart={() => onPageStart?.()}
          />
          <div className="o-hint">
            <span className="hint-k"><span className="hint-kbd">↑ To Do</span> promotes to today</span>
          </div>
        </section>

        <section className="section" id="section-todo-list">
          <div className="section-hd">
            <span className="section-title todo">To Do</span>
            <span className="section-sub">· today</span>
          </div>
          <Outliner
            key={`todo-${viewDay}-${tick}`}
            listState="todo"
            viewDay={viewDay}
            refresh={refresh}
            openLogPopup={openLogPopup}
            onEnd={() => onPageEnd?.()}
            onStart={() => { const id = lastOf('backlog'); if (id) scheduleOutlinerFocus(id); refresh(); }}
          />
          <div className="o-hint">
            <span className="hint-k"><span className="hint-kbd">▶ Start</span> moves to In Progress</span>
            <span className="hint-k"><span className="hint-kbd">↓ Defer</span> sends to Backlog</span>
          </div>
        </section>
      </div>
    </div>
  );
}
