import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DailyPage from './components/pages/DailyPage';
import TodoPage from './components/pages/TodoPage';
import ActivePage from './components/pages/ActivePage';
import GigsPage from './components/pages/GigsPage';
import ArchiveOverlay from './components/shared/ArchiveOverlay';
import LogPopup from './components/shared/LogPopup';
import { scheduleOutlinerFocus } from './components/shared/Outliner';
import { todayKey, getTasks } from './db';

const PAGE_META = {
  daily:  { title: 'Daily',           archiveTab: 'grateful' },
  todo:   { title: 'To Do',           archiveTab: 'activity', subtitle: '· active list + backlog' },
  active: { title: 'Active',          archiveTab: 'activity', subtitle: '· in flight + finished' },
  gigs:   { title: 'Gigs & Meetings', archiveTab: 'events',   subtitle: '· upcoming · sorted by date' },
};

export default function App() {
  const [page, setPage] = useState('daily');
  const [viewDay, setViewDay] = useState(todayKey());
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState('activity');
  const [logPopup, setLogPopup] = useState(null); // { taskId, type, onDone }
  // tick is bumped whenever DB changes so all components re-read
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  const openArchive = useCallback((tab = 'grateful') => {
    setArchiveTab(tab);
    setArchiveOpen(true);
  }, []);

  const openLogPopup = useCallback((taskId, type, onDone) => {
    setLogPopup({ taskId, type, onDone });
  }, []);

  const closeLogPopup = useCallback(() => setLogPopup(null), []);

  const PAGES = ['daily', 'todo', 'active', 'gigs'];
  useEffect(() => {
    const handler = (e) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      setPage(p => {
        const idx = PAGES.indexOf(p);
        if (e.key === 'ArrowUp') return PAGES[Math.max(0, idx - 1)];
        return PAGES[Math.min(PAGES.length - 1, idx + 1)];
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const focusFirstTask = useCallback((listState) => {
    const task = getTasks().filter(t => !t.archived && t.state === listState)[0];
    if (task) scheduleOutlinerFocus(task.id);
  }, []);

  const focusLastTask = useCallback((listState) => {
    const tasks = getTasks().filter(t => !t.archived && t.state === listState);
    const task = tasks[tasks.length - 1];
    if (task) scheduleOutlinerFocus(task.id);
  }, []);

  const pageProps = { viewDay, setViewDay, refresh, tick, openArchive, openLogPopup };

  const meta = PAGE_META[page];
  const dailySubtitle = `· journal · ${viewDay === todayKey() ? 'resets at midnight' : 'viewing past day'}`;
  const subtitle = page === 'daily' ? dailySubtitle : meta.subtitle;

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} viewDay={viewDay} setViewDay={setViewDay} tick={tick} onClearData={refresh} openArchive={openArchive} archiveOpen={archiveOpen} onCloseArchive={() => setArchiveOpen(false)} onTopicChange={refresh} />
      <main className="main">
        <Topbar viewDay={viewDay} tick={tick} />
        <div className="page-header">
          <div className="page-title">{meta.title}</div>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
          <div className="page-actions">
            <button className="btn ghost" onClick={() => openArchive(meta.archiveTab)}>Activity</button>
          </div>
        </div>
        <div className="page-area">
          {page === 'daily'  && <DailyPage  {...pageProps} />}
          {page === 'todo'   && <TodoPage   {...pageProps} onPageEnd={() => { focusFirstTask('inprogress'); setPage('active'); }} onPageStart={() => setPage('daily')} />}
          {page === 'active' && <ActivePage {...pageProps} onPageEnd={() => setPage('gigs')} onPageStart={() => { focusLastTask('todo'); setPage('todo'); }} />}
          {page === 'gigs'   && <GigsPage   {...pageProps} />}
        </div>
      </main>
      <ArchiveOverlay
        open={archiveOpen}
        tab={archiveTab}
        setTab={setArchiveTab}
        onClose={() => setArchiveOpen(false)}
        tick={tick}
      />
      {logPopup && (
        <LogPopup
          taskId={logPopup.taskId}
          type={logPopup.type}
          onDone={(note) => { logPopup.onDone(note); closeLogPopup(); }}
          onCancel={closeLogPopup}
        />
      )}
    </div>
  );
}
