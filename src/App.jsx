import React, { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DailyPage from './components/pages/DailyPage';
import TodoPage from './components/pages/TodoPage';
import ActivePage from './components/pages/ActivePage';
import GigsPage from './components/pages/GigsPage';
import ArchiveOverlay from './components/shared/ArchiveOverlay';
import LogPopup from './components/shared/LogPopup';
import { todayKey } from './db';

export default function App() {
  const [page, setPage] = useState('daily');
  const [viewDay, setViewDay] = useState(todayKey());
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState('grateful');
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

  const pageProps = { viewDay, setViewDay, refresh, tick, openArchive, openLogPopup };

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} viewDay={viewDay} setViewDay={setViewDay} tick={tick} />
      <main className="main">
        <Topbar viewDay={viewDay} tick={tick} openArchive={openArchive} />
        <div className="page-area">
          {page === 'daily'  && <DailyPage  {...pageProps} />}
          {page === 'todo'   && <TodoPage   {...pageProps} />}
          {page === 'active' && <ActivePage {...pageProps} />}
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
