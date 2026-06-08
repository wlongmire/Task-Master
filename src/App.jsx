import React, { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { initDB, rolloverTodos, todayKey, getTasks } from './db';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DailyPage from './components/pages/DailyPage';
import TodoPage from './components/pages/TodoPage';
import ActivePage from './components/pages/ActivePage';
import GigsPage from './components/pages/GigsPage';
import ArchiveOverlay from './components/shared/ArchiveOverlay';
import LogPopup from './components/shared/LogPopup';
import { scheduleOutlinerFocus } from './components/shared/Outliner';

const PAGE_META = {
  daily:  { title: 'Daily',           archiveTab: 'grateful' },
  todo:   { title: 'To Do',           archiveTab: 'activity', subtitle: '· active list + backlog' },
  active: { title: 'Active',          archiveTab: 'activity', subtitle: '· in flight + finished' },
  gigs:   { title: 'Gigs & Engagements', archiveTab: 'events',   subtitle: '· upcoming · sorted by date' },
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 600);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
}

export default function App() {
  const [user,    setUser]    = useState(undefined); // undefined = checking auth
  const [dbReady, setDbReady] = useState(false);
  const isMobile = useIsMobile();

  const [page,       setPage]       = useState('daily');
  const [viewDay,    setViewDay]    = useState(todayKey());
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTab,  setArchiveTab]  = useState('activity');
  const [logPopup,    setLogPopup]    = useState(null);
  const [tick,        setTick]        = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  // ── Auth listener ────────────────────────────────────────────────────────
  useEffect(() => {
    let cleanupDB = null;
    let activeUid = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (u && u.uid === activeUid) return; // same user re-authed for token refresh
      setUser(u);
      setDbReady(false);
      if (cleanupDB) { cleanupDB(); cleanupDB = null; }
      activeUid = u?.uid ?? null;
      if (u) {
        console.log('[Auth] signed in as', u.email, '| uid:', u.uid);
        cleanupDB = initDB(u.uid, refresh, () => {
          rolloverTodos();
          setDbReady(true);
        });
      }
    });
    return () => { unsubAuth(); if (cleanupDB) cleanupDB(); };
  }, []);

  // ── Keyboard page navigation ─────────────────────────────────────────────
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
    if (tasks.length) scheduleOutlinerFocus(tasks[tasks.length - 1].id);
  }, []);

  const openArchive   = useCallback((tab = 'grateful') => { setArchiveTab(tab); setArchiveOpen(true); }, []);
  const openLogPopup  = useCallback((taskId, type, onDone, title) => setLogPopup({ taskId, type, onDone, title }), []);
  const closeLogPopup = useCallback(() => setLogPopup(null), []);

  // ── Auth loading ─────────────────────────────────────────────────────────
  if (user === undefined) return <Splash label="Checking auth…" />;
  if (!user)              return <Login />;
  if (!dbReady)           return <Splash label="Loading your data…" />;

  const pageProps = { viewDay, setViewDay, refresh, tick, openArchive, openLogPopup };
  const meta      = PAGE_META[page];
  const subtitle  = page === 'daily'
    ? `· journal · ${viewDay === todayKey() ? 'resets at midnight' : 'viewing past day'}`
    : meta.subtitle;

  return (
    <div className="app">
      <Sidebar
        page={page} setPage={setPage}
        viewDay={viewDay} setViewDay={setViewDay}
        tick={tick} onClearData={refresh}
        openArchive={openArchive}
        archiveOpen={archiveOpen} onCloseArchive={() => setArchiveOpen(false)}
        onTopicChange={refresh}
        onSignOut={() => signOut(auth)}
        mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)}
      />
      
      <main className="main">
        <Topbar viewDay={viewDay} tick={tick} />
        <div className="page-header hide-mobile">
          <div className="page-title">{meta.title}</div>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
          <div className="page-actions">
            <button className="btn ghost" onClick={() => openArchive(meta.archiveTab)}>Activity</button>
          </div>
        </div>
        <div className="mobile-section-nav show-mobile">
          {[
            { id: 'section-reflections',  label: 'Reflections',  color: 'var(--c-reflection)' },
            { id: 'section-todo-list',    label: 'Todo',         color: 'var(--c-todo)' },
            { id: 'section-inprogress',   label: 'In Progress',  color: 'var(--c-inprogress)' },
            { id: 'section-completed',    label: 'Completed',    color: 'var(--c-completed)' },
            { id: 'section-gigs-list',    label: 'Gigs',         color: 'var(--c-gigs)' },
            { id: 'section-meetings-list',label: 'Engagements',  color: 'var(--c-inprogress)' },
          ].map(({ id, label, color }) => (
            <button key={id} className="mobile-nav-pill" onClick={() => {
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{ '--pill-color': color }}>
              {label}
            </button>
          ))}
        </div>
        <div className="page-area">
          {isMobile ? (
            <>
              <div id="section-daily"><DailyPage  {...pageProps} /></div>
              <div id="section-todo"><TodoPage   {...pageProps} /></div>
              <div id="section-active"><ActivePage {...pageProps} /></div>
              <div id="section-gigs"><GigsPage {...pageProps} /></div>
            </>
          ) : (
            <>
              {page === 'daily'  && <DailyPage  {...pageProps} />}
              {page === 'todo'   && <TodoPage   {...pageProps} onPageEnd={() => { focusFirstTask('inprogress'); setPage('active'); }} onPageStart={() => setPage('daily')} />}
              {page === 'active' && <ActivePage {...pageProps} onPageEnd={() => setPage('gigs')} onPageStart={() => { focusLastTask('todo'); setPage('todo'); }} />}
              {page === 'gigs'   && <GigsPage   {...pageProps} />}
            </>
          )}
        </div>
      </main>
      <ArchiveOverlay open={archiveOpen} tab={archiveTab} setTab={setArchiveTab} onClose={() => setArchiveOpen(false)} tick={tick} />
      {logPopup && (
        <LogPopup
          taskId={logPopup.taskId} title={logPopup.title} type={logPopup.type}
          onDone={(note) => { logPopup.onDone(note); closeLogPopup(); }}
          onCancel={closeLogPopup}
        />
      )}
    </div>
  );
}

function Splash({ label }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>
        Task Master
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: '0.08em' }}>
        {label}
      </div>
    </div>
  );
}
