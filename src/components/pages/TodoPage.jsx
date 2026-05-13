import React from 'react';
import Outliner from '../shared/Outliner';

export default function TodoPage({ viewDay, refresh, tick, openArchive, openLogPopup }) {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">To Do</div>
        <div className="page-subtitle">· active list + backlog</div>
        <div className="page-actions">
          <button className="btn ghost" onClick={() => openArchive('tasks')}>Archive</button>
        </div>
      </div>
      <div className="page-grid">
        <section className="section">
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
          />
          <div className="o-hint">
            <span className="hint-k"><span className="hint-kbd">↑ To Do</span> promotes to today</span>
          </div>
        </section>

        <section className="section">
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
