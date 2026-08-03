// ─── Task Master DB — Firestore backend ───────────────────────────────────────
// Public read API is synchronous (reads local cache).
// Writes update cache immediately then persist to Firestore.
// onSnapshot listeners keep cache in sync across devices.

import { db } from './firebase';
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch, getDocs,
} from 'firebase/firestore';

// ── ID generator ──────────────────────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Firestore sanitizer (strips undefined, which Firestore rejects) ────────────
function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
}

// ── Local cache ───────────────────────────────────────────────────────────────
let _uid         = null;
let _refreshFn   = null;
let _onReadyFn   = null;
let _unsubs      = [];
let _loaded      = new Set();
let _readyCalled = false; // guards onReady so it fires at most once per session

const COLLECTIONS = ['tasks', 'events', 'meetings', 'categories', 'habits', 'grateful', 'intentions', 'briefings', 'reflections'];

let _cache = {
  tasks: [], events: [], meetings: [], categories: [], habits: [],
  grateful: {}, intentions: {}, briefings: {}, reflections: {},
};

// ── LocalStorage offline cache ────────────────────────────────────────────────
// After every Firestore sync we snapshot _cache to localStorage so that if the
// next page-load times out (no network / Firebase down) the app can still show
// the most recent data instead of a blank screen.
const _lsKey = uid => `tm_offline_${uid}`;

function _persistToLS() {
  if (!_uid) return;
  try {
    localStorage.setItem(_lsKey(_uid), JSON.stringify({ cache: _cache, savedAt: Date.now() }));
  } catch (e) {
    console.warn('[TaskMaster] localStorage persist failed:', e);
  }
}

function _loadFromLS(uid) {
  try {
    const raw = localStorage.getItem(_lsKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic shape guard — if the stored object is missing core keys, ignore it
    if (!parsed?.cache?.tasks) return null;
    return parsed;
  } catch {
    return null;
  }
}

function _userCol(name)       { return collection(db, 'users', _uid, name); }
function _userDoc(col, docId) { return doc(db, 'users', _uid, col, docId); }

// ── Mock mode (dev/testing) ─────────────────────────────────────────────────
// When on, all Firestore writes become no-ops and the app runs purely against
// the in-memory cache (seeded with sample data). Enabled via `?mock` in the URL
// — see initMockDB() and App.jsx. Lets the UI be exercised without logging in.
let _mock = false;
export function isMockMode() { return _mock; }

function _set(ref, data)    { return _mock ? Promise.resolve() : setDoc(ref, data); }
function _update(ref, data) { return _mock ? Promise.resolve() : updateDoc(ref, data); }
function _delete(ref)       { return _mock ? Promise.resolve() : deleteDoc(ref); }

function _markLoaded(name) {
  const wasReady = _loaded.size >= COLLECTIONS.length;
  _loaded.add(name);
  const nowReady = _loaded.size >= COLLECTIONS.length;
  if (nowReady && !wasReady) {
    _persistToLS(); // snapshot fresh data so offline fallback stays current
    if (!_readyCalled) { _readyCalled = true; _onReadyFn?.(); }
    _refreshFn?.();
  } else if (nowReady) {
    _persistToLS(); // keep snapshot fresh on subsequent Firestore updates
    _refreshFn?.();
  }
}

// ── Init / Cleanup ────────────────────────────────────────────────────────────
export function initDB(uid, onRefresh, onReady) {
  // tear down any previous session
  _unsubs.forEach(fn => fn());
  _unsubs      = [];
  _loaded      = new Set();
  _readyCalled = false;
  _uid         = uid;
  // Wrap onRefresh so every cache mutation automatically updates localStorage.
  // This keeps the offline snapshot fresh without touching every write function.
  _refreshFn   = () => { onRefresh(); _persistToLS(); };
  _onReadyFn   = onReady;
  _cache       = { tasks: [], events: [], meetings: [], categories: [], habits: [], grateful: {}, intentions: {}, briefings: {}, reflections: {} };

  // Array collections
  for (const col of ['tasks', 'events', 'meetings', 'categories', 'habits']) {
    const unsub = onSnapshot(_userCol(col), snap => {
      _cache[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _markLoaded(col);
    }, err => console.error('Firestore', col, err));
    _unsubs.push(unsub);
  }

  // Map collections (keyed by date)
  for (const col of ['grateful', 'intentions', 'briefings', 'reflections']) {
    const unsub = onSnapshot(_userCol(col), snap => {
      _cache[col] = {};
      snap.docs.forEach(d => { _cache[col][d.id] = d.data(); });
      _markLoaded(col);
    }, err => console.error('Firestore', col, err));
    _unsubs.push(unsub);
  }

  // Safari kills WebSocket connections in the background and doesn't always
  // re-fire onSnapshot when the tab comes back. Force a full re-fetch on
  // visibility restore or network reconnect so data is never stale.
  const resync = () => {
    if (document.hidden || !_uid) return;
    const arrayCols = ['tasks', 'events', 'meetings', 'categories', 'habits'];
    const mapCols   = ['grateful', 'intentions', 'briefings', 'reflections'];
    Promise.all([
      ...arrayCols.map(col =>
        getDocs(_userCol(col)).then(snap => {
          _cache[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        })
      ),
      ...mapCols.map(col =>
        getDocs(_userCol(col)).then(snap => {
          _cache[col] = {};
          snap.docs.forEach(d => { _cache[col][d.id] = d.data(); });
        })
      ),
    ]).then(() => _refreshFn?.()).catch(err => console.warn('resync failed', err));
  };

  document.addEventListener('visibilitychange', resync);
  window.addEventListener('online', resync);

  // Offline fallback — if Firestore hasn't delivered all collections within
  // 8 seconds (slow network, Firebase outage, etc.), load the most recent
  // localStorage snapshot so the app isn't blank. The Firestore listeners keep
  // running; when they fire they overwrite the cache and refresh the UI.
  const offlineTimer = setTimeout(() => {
    if (_readyCalled) return; // Firestore already loaded — nothing to do
    const snap = _loadFromLS(uid);
    if (!snap) return;        // first-ever load or no stored data
    _cache = snap.cache;
    _readyCalled = true;
    _onReadyFn?.();
    _refreshFn?.();
    console.warn(
      '[Task Master] Firebase timeout — showing offline cache from',
      new Date(snap.savedAt).toLocaleString(),
    );
  }, 8000);
  _unsubs.push(() => clearTimeout(offlineTimer));

  return () => {
    _unsubs.forEach(fn => fn());
    _unsubs = []; _uid = null; _refreshFn = null; _onReadyFn = null;
    _loaded = new Set(); _readyCalled = false;
    document.removeEventListener('visibilitychange', resync);
    window.removeEventListener('online', resync);
  };
}

// ── Mock init (dev/testing) ─────────────────────────────────────────────────
// Bypasses Firestore + auth entirely. Seeds sample data into the in-memory
// cache so the full UI can be exercised without logging in. Triggered from
// App.jsx when the URL contains `?mock`.
export function initMockDB(onRefresh, onReady) {
  _mock        = true;
  _uid         = 'mock';
  _refreshFn   = onRefresh;
  _onReadyFn   = onReady;
  _readyCalled = true;
  _cache       = _seedMock();
  onReady?.();
  onRefresh?.();
  return () => {
    _mock = false; _uid = null; _refreshFn = null; _onReadyFn = null;
    _readyCalled = false;
    _cache = { tasks: [], events: [], meetings: [], categories: [], habits: [], grateful: {}, intentions: {}, briefings: {}, reflections: {} };
  };
}

function _seedMock() {
  const today = todayKey();
  const now   = Date.now();
  const cat = (id, name) => ({ id, name });
  const task = (id, text, state, categoryId, extra = {}) => ({
    id, text, state, categoryId,
    archived: false, sortOrder: now + Math.random() * 1000,
    dayKey: state === 'todo' ? today : undefined,
    dateCompleted: state === 'completed' ? now : undefined,
    log: [{ id: id + '-c', type: 'created', note: null, loggedAt: now }],
    ...extra,
  });
  return {
    categories: [cat('c-work', 'Work'), cat('c-home', 'Personal'), cat('c-errand', 'Errands')],
    tasks: [
      task('t1', 'Ship the mock-mode flag', 'todo', 'c-work'),
      task('t2', 'Review pull requests', 'todo', 'c-work', { urgent: true }),
      task('t3', 'Buy groceries', 'todo', 'c-home'),
      task('t4', 'Draft Q3 roadmap', 'backlog', 'c-work'),
      task('t5', 'Plan weekend trip', 'backlog', 'c-home'),
      task('t6', 'Refactor data layer', 'inprogress', 'c-work', {
        log: [
          { id: 't6-c', type: 'created', note: null, loggedAt: now - 86400000 },
          { id: 't6-s', type: 'started', note: null, loggedAt: now - 3600000 },
          { id: 't6-p', type: 'progress', note: 'Wrapped Firestore writes', loggedAt: now - 1800000 },
        ],
      }),
      task('t7', 'Fix Safari time picker', 'completed', 'c-work', {
        log: [{ id: 't7-d', type: 'done', note: 'Added onBlur fallback', loggedAt: now }],
      }),
      task('t8', 'Renew passport', 'completed', 'c-errand'),
      task('t9', 'Uncategorized done task', 'completed', null),
    ],
    events: [
      { id: 'e1', name: 'Jazz night', date: today, time: '20:00', archived: false, done: false, categoryId: 'c-home', log: [] },
    ],
    meetings: [
      { id: 'm1', name: 'Design sync', date: today, time: '14:30', archived: false, done: false, categoryId: 'c-work', log: [] },
    ],
    habits: (() => {
      const y1 = offsetDate(today, -1), y2 = offsetDate(today, -2), y3 = offsetDate(today, -3);
      const habit = (id, text, categoryId, doneDays, sort, schedule = { type: 'daily' }) => ({
        id, text, categoryId, archived: false, sortOrder: now + sort, createdAt: now, schedule,
        completions: Object.fromEntries(doneDays.map(dk => [dk, { completedAt: now, note: null }])),
      });
      return [
        habit('h1', 'Meditate', 'c-home', [today, y1, y2, y3], 1),
        habit('h2', 'Exercise', 'c-home', [today, y1, y2], 2, { type: 'weekly', target: 3 }),
        habit('h3', 'Read 20 min', 'c-home', [today, y1, y2, y3], 3),
        habit('h4', 'Journal', 'c-home', [], 4),
        habit('h5', 'Drink water', 'c-home', [today, y1], 5),
        habit('h6', 'Deep clean', 'c-home', [y1], 6, { type: 'monthly', target: 1 }),
      ];
    })(),
    grateful: {}, intentions: {}, briefings: {}, reflections: {},
  };
}

// ── Date utils ────────────────────────────────────────────────────────────────
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function todayKey()           { return dateKey(new Date()); }
export function offsetDate(dk, days) {
  const d = new Date(dk + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export function formatDateShort(dk) {
  const d = new Date(dk + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Grateful ──────────────────────────────────────────────────────────────────
export function getGrateful(dk)       { return _cache.grateful[dk] || { text: '' }; }
export function getGratefulDays()     { return Object.keys(_cache.grateful).filter(k => _cache.grateful[k].text).sort().reverse(); }
export function setGrateful(dk, text) {
  const val = { text, savedAt: Date.now() };
  _cache.grateful[dk] = val;
  _persistToLS();
  _set(_userDoc('grateful', dk), clean(val));
}

// ── Intentions ────────────────────────────────────────────────────────────────
export function getIntentions(dk)       { return _cache.intentions[dk] || { text: '' }; }
export function getIntentionsDays()     { return Object.keys(_cache.intentions).filter(k => _cache.intentions[k].text).sort().reverse(); }
export function setIntentions(dk, text) {
  const val = { text, savedAt: Date.now() };
  _cache.intentions[dk] = val;
  _persistToLS();
  _set(_userDoc('intentions', dk), clean(val));
}

// ── Reflection ────────────────────────────────────────────────────────────────
export function getReflection(dk) {
  const doc = _cache.reflections[dk];
  if (!doc) return { entries: [] };
  if (doc.entries) return doc;
  // Legacy doc: { text, savedAt } — surface as _legacyText, no entries
  return { entries: [], _legacyText: doc.text };
}
export function getReflectionDays() {
  return Object.keys(_cache.reflections)
    .filter(k => {
      const doc = _cache.reflections[k];
      return (doc.entries && doc.entries.length > 0) || doc.text;
    })
    .sort().reverse();
}
export function addReflectionEntry(dk, text) {
  const doc = _cache.reflections[dk] || { entries: [] };
  const entries = [...(doc.entries || []), { id: crypto.randomUUID(), text, createdAt: Date.now() }];
  const val = { entries, savedAt: Date.now() };
  _cache.reflections[dk] = val;
  _persistToLS();
  _set(_userDoc('reflections', dk), clean(val));
}
export function deleteReflectionEntry(dk, id) {
  const doc = _cache.reflections[dk];
  if (!doc || !doc.entries) return;
  const val = { entries: doc.entries.filter(e => e.id !== id), savedAt: Date.now() };
  _cache.reflections[dk] = val;
  _persistToLS();
  _set(_userDoc('reflections', dk), clean(val));
}
export function updateReflectionEntry(dk, id, newText) {
  const doc = _cache.reflections[dk];
  if (!doc || !doc.entries) return;
  const val = { entries: doc.entries.map(e => e.id === id ? { ...e, text: newText } : e), savedAt: Date.now() };
  _cache.reflections[dk] = val;
  _persistToLS();
  _set(_userDoc('reflections', dk), clean(val));
}
export function setReflection(dk, text) {
  const val = { text, savedAt: Date.now() };
  _cache.reflections[dk] = val;
  _persistToLS();
  _set(_userDoc('reflections', dk), clean(val));
}

// ── Daily Briefing ────────────────────────────────────────────────────────────
export function getDailyBriefing(dk)          { return _cache.briefings[dk] || {}; }
export function setDailyBriefing(dk, updates) {
  const val = { ...(_cache.briefings[dk] || {}), ...updates };
  _cache.briefings[dk] = val;
  _persistToLS();
  _set(_userDoc('briefings', dk), clean(val));
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export function getTasks() {
  return [..._cache.tasks].sort((a, b) =>
    (a.sortOrder ?? a.dateCreated ?? 0) - (b.sortOrder ?? b.dateCreated ?? 0)
  );
}

export function addTask(task) {
  const now     = Date.now();
  const newTask = {
    id: genId(), dateCreated: now, archived: false, sortOrder: now,
    log: [{ id: now + '-c', type: 'created', note: null, loggedAt: now }],
    ...task,
  };
  _cache.tasks = [..._cache.tasks, newTask];
  _set(_userDoc('tasks', newTask.id), clean(newTask));
  _refreshFn?.();
  return newTask;
}

export function insertTaskAfter(afterId, task) {
  const sorted   = getTasks();
  const now      = Date.now();
  const afterIdx = sorted.findIndex(t => t.id === afterId);
  const after    = sorted[afterIdx];
  const next     = sorted[afterIdx + 1];
  const sortOrder = after && next
    ? ((after.sortOrder ?? after.dateCreated ?? 0) + (next.sortOrder ?? next.dateCreated ?? 0)) / 2
    : after
      ? (after.sortOrder ?? after.dateCreated ?? now) + 1000
      : now;

  const newTask = {
    id: genId(), dateCreated: now, archived: false, sortOrder,
    log: [{ id: now + '-c', type: 'created', note: null, loggedAt: now }],
    ...task,
  };
  _cache.tasks = [..._cache.tasks, newTask];
  _set(_userDoc('tasks', newTask.id), clean(newTask));
  _refreshFn?.();
  return newTask;
}

export function updateTask(id, updates) {
  const idx = _cache.tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  _cache.tasks[idx] = { ..._cache.tasks[idx], ...updates };
  _update(_userDoc('tasks', id), clean(updates));
  _refreshFn?.();
}

export function moveTask(id, newState) {
  const updates = { state: newState };
  if (newState === 'completed')                    updates.dateCompleted = Date.now();
  if (newState === 'inprogress')                   updates.dateStarted   = Date.now();
  if (newState === 'todo' || newState === 'backlog') {
    updates.dateStarted = null; updates.dateCompleted = null;
  }
  updateTask(id, updates);
}

export function archiveTask(id) { updateTask(id, { archived: true, archivedAt: Date.now() }); }

export function deleteTask(id) {
  _cache.tasks = _cache.tasks.filter(t => t.id !== id);
  _delete(_userDoc('tasks', id));
  _refreshFn?.();
}

export function restoreTask(id, dayKey) {
  updateTask(id, { state: 'todo', dayKey, dateCompleted: null, archived: false });
}

export function getArchivedTasks() {
  return getTasks().filter(t => t.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
}

export function addLogEntry(taskId, { type, note = null }) {
  const idx = _cache.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;
  const entry      = { id: String(Date.now()), type, note, loggedAt: Date.now() };
  const updatedLog = [...(_cache.tasks[idx].log || []), entry];
  _cache.tasks[idx] = { ..._cache.tasks[idx], log: updatedLog };
  _update(_userDoc('tasks', taskId), clean({ log: updatedLog }));
  _refreshFn?.();
  return entry;
}

export function rolloverTodos() {
  const today = todayKey();
  const stale = _cache.tasks.filter(t => !t.archived && t.state === 'todo' && t.dayKey && t.dayKey < today);
  stale.forEach(t => {
    t.dayKey = today;
    _update(_userDoc('tasks', t.id), { dayKey: today });
  });
  if (stale.length) _refreshFn?.();
}

// ── Categories ────────────────────────────────────────────────────────────────
export function getCategories()         { return [..._cache.categories].filter(c => !c.archived); }
export function getArchivedCategories() { return [..._cache.categories].filter(c => c.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0)); }

export function addCategory(cat) {
  const newCat = { id: genId(), ...cat };
  _cache.categories = [..._cache.categories, newCat];
  _set(_userDoc('categories', newCat.id), clean(newCat));
  _refreshFn?.();
  return newCat;
}
export function updateCategory(id, updates) {
  const idx = _cache.categories.findIndex(c => c.id === id);
  if (idx === -1) return;
  _cache.categories[idx] = { ..._cache.categories[idx], ...updates };
  _update(_userDoc('categories', id), clean(updates));
  _refreshFn?.();
}
export function archiveCategory(id) {
  const now = Date.now();
  _cache.tasks.forEach(t => {
    if (t.categoryId === id && !t.archived) {
      t.archived = true; t.archivedAt = now;
      _update(_userDoc('tasks', t.id), { archived: true, archivedAt: now });
    }
  });
  const idx = _cache.categories.findIndex(c => c.id === id);
  if (idx !== -1) {
    _cache.categories[idx] = { ..._cache.categories[idx], archived: true, archivedAt: now };
    _update(_userDoc('categories', id), { archived: true, archivedAt: now });
  }
  _refreshFn?.();
}
export function restoreCategory(id) {
  _cache.tasks.forEach(t => {
    if (t.categoryId === id && t.archived) {
      t.archived = false; t.archivedAt = null; t.state = 'todo';
      _update(_userDoc('tasks', t.id), { archived: false, archivedAt: null, state: 'todo' });
    }
  });
  const idx = _cache.categories.findIndex(c => c.id === id);
  if (idx !== -1) {
    _cache.categories[idx] = { ..._cache.categories[idx], archived: false, archivedAt: null };
    _update(_userDoc('categories', id), { archived: false, archivedAt: null });
  }
  _refreshFn?.();
}
export function deleteCategory(id) {
  // Cascade-delete all tasks belonging to this category
  _cache.tasks.filter(t => t.categoryId === id).forEach(t => _delete(_userDoc('tasks', t.id)));
  _cache.tasks       = _cache.tasks.filter(t => t.categoryId !== id);
  _cache.categories  = _cache.categories.filter(c => c.id !== id);
  _delete(_userDoc('categories', id));
  _refreshFn?.();
}

// ── Events / Gigs ─────────────────────────────────────────────────────────────
export function getEvents() { return [..._cache.events]; }

export function addEvent(evt) {
  const newEvt = { id: genId(), archived: false, done: false, log: [], ...evt };
  _cache.events = [..._cache.events, newEvt];
  _set(_userDoc('events', newEvt.id), clean(newEvt));
  _refreshFn?.();
  return newEvt;
}
export function updateEvent(id, updates) {
  const idx = _cache.events.findIndex(e => e.id === id);
  if (idx === -1) return;
  _cache.events[idx] = { ..._cache.events[idx], ...updates };
  _update(_userDoc('events', id), clean(updates));
  _refreshFn?.();
}
export function addEventLogEntry(id, { type, note = null }) {
  const idx = _cache.events.findIndex(e => e.id === id);
  if (idx === -1) return;
  const entry      = { id: String(Date.now()), type, note, loggedAt: Date.now() };
  const updatedLog = [...(_cache.events[idx].log || []), entry];
  _cache.events[idx] = { ..._cache.events[idx], log: updatedLog };
  _update(_userDoc('events', id), clean({ log: updatedLog }));
}
export function archiveEvent(id) { updateEvent(id, { archived: true }); }
export function deleteEvent(id)  {
  _cache.events = _cache.events.filter(e => e.id !== id);
  _delete(_userDoc('events', id));
  _refreshFn?.();
}

// ── Meetings ──────────────────────────────────────────────────────────────────
export function getMeetings() { return [..._cache.meetings]; }

export function addMeeting(mtg) {
  const newMtg = { id: genId(), archived: false, done: false, log: [], ...mtg };
  _cache.meetings = [..._cache.meetings, newMtg];
  _set(_userDoc('meetings', newMtg.id), clean(newMtg));
  _refreshFn?.();
  return newMtg;
}
export function updateMeeting(id, updates) {
  const idx = _cache.meetings.findIndex(m => m.id === id);
  if (idx === -1) return;
  _cache.meetings[idx] = { ..._cache.meetings[idx], ...updates };
  _update(_userDoc('meetings', id), clean(updates));
  _refreshFn?.();
}
export function addMeetingLogEntry(id, { type, note = null }) {
  const idx = _cache.meetings.findIndex(m => m.id === id);
  if (idx === -1) return;
  const entry      = { id: String(Date.now()), type, note, loggedAt: Date.now() };
  const updatedLog = [...(_cache.meetings[idx].log || []), entry];
  _cache.meetings[idx] = { ..._cache.meetings[idx], log: updatedLog };
  _update(_userDoc('meetings', id), clean({ log: updatedLog }));
}
export function archiveMeeting(id) { updateMeeting(id, { archived: true }); }
export function deleteMeeting(id)  {
  _cache.meetings = _cache.meetings.filter(m => m.id !== id);
  _delete(_userDoc('meetings', id));
  _refreshFn?.();
}

// ── Habits ──────────────────────────────────────────────────────────────────
// A habit is a recurring daily item. `completions` is a date-keyed map
// ({ 'YYYY-MM-DD': { completedAt, note } }) — the same shape powers both the
// "done today" state and the streak count. Habits persist; they are archived,
// not deleted, in the normal flow.
export function getHabits() {
  return [..._cache.habits].filter(h => !h.archived).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}
export function addHabit(habit) {
  const id = genId();
  const newHabit = { id, sortOrder: Date.now(), createdAt: Date.now(), completions: {}, archived: false, ...habit };
  _cache.habits = [..._cache.habits, newHabit];
  _set(_userDoc('habits', id), clean(newHabit));
  _refreshFn?.();
  return newHabit;
}
export function updateHabit(id, updates) {
  _cache.habits = _cache.habits.map(h => h.id === id ? { ...h, ...updates } : h);
  _update(_userDoc('habits', id), clean(updates));
  _refreshFn?.();
}
export function setHabitDone(id, dayKey, note = null) {
  const h = _cache.habits.find(x => x.id === id);
  if (!h) return;
  const completions = { ...(h.completions || {}), [dayKey]: { completedAt: Date.now(), note } };
  updateHabit(id, { completions });
}
export function clearHabitDone(id, dayKey) {
  const h = _cache.habits.find(x => x.id === id);
  if (!h || !h.completions || !(dayKey in h.completions)) return;
  const completions = { ...h.completions };
  delete completions[dayKey];
  updateHabit(id, { completions });
}
export function archiveHabit(id) { updateHabit(id, { archived: true, archivedAt: Date.now() }); }
export function deleteHabit(id)  {
  _cache.habits = _cache.habits.filter(h => h.id !== id);
  _delete(_userDoc('habits', id));
  _refreshFn?.();
}
// ── Habit schedules ──────────────────────────────────────────────────────
// schedule: { type:'daily' } | { type:'weekly', target } | { type:'monthly', target }
// A "period" is a day / calendar week (Sunday-start) / calendar month; a period
// is "met" when its completion count reaches the target (daily target = 1).
function _weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  return dateKey(d);
}
function _periodKey(dateStr, type) {
  if (type === 'weekly')  return _weekStart(dateStr);
  if (type === 'monthly') return dateStr.slice(0, 7); // YYYY-MM
  return dateStr;
}
function _prevPeriod(pk, type) {
  if (type === 'weekly')  return offsetDate(pk, -7);
  if (type === 'monthly') {
    const [y, m] = pk.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return offsetDate(pk, -1);
}
function _periodCounts(completions, type) {
  const counts = {};
  for (const dk of Object.keys(completions || {})) {
    const pk = _periodKey(dk, type);
    counts[pk] = (counts[pk] || 0) + 1;
  }
  return counts;
}
function _habitTarget(habit) {
  const s = habit.schedule || { type: 'daily' };
  return s.type === 'daily' ? 1 : (s.target || 1);
}

// Current-period progress: { type, count, target }.
export function habitPeriodProgress(habit, today = todayKey()) {
  const type = habit.schedule?.type || 'daily';
  const counts = _periodCounts(habit.completions, type);
  return { type, count: counts[_periodKey(today, type)] || 0, target: _habitTarget(habit) };
}

// Consecutive periods that hit the target, counting back from the current
// period, with grace for the current in-progress period (so the streak doesn't
// reset before the period is over). Daily habits reduce to consecutive days.
export function habitStreak(habit, today = todayKey()) {
  const type = habit.schedule?.type || 'daily';
  const target = _habitTarget(habit);
  const counts = _periodCounts(habit.completions, type);
  const met = pk => (counts[pk] || 0) >= target;
  let cursor = _periodKey(today, type);
  if (!met(cursor)) cursor = _prevPeriod(cursor, type); // grace for current period
  let streak = 0;
  while (met(cursor)) { streak++; cursor = _prevPeriod(cursor, type); }
  return streak;
}

// ── Export ────────────────────────────────────────────────────────────────────
export function exportData() {
  const payload = JSON.stringify({
    schemaVersion: 2,
    tasks:      _cache.tasks,
    events:     _cache.events,
    meetings:   _cache.meetings,
    categories: _cache.categories,
    habits:     _cache.habits,
    grateful:   _cache.grateful,
    intentions: _cache.intentions,
    briefings:  _cache.briefings,
  }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `taskmaster-${dateKey(new Date())}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────
export function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload  = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (typeof data !== 'object' || !data) throw new Error('Invalid file format');

        // Firestore rejects undefined values — strip them out
        const clean = (obj) => JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));

        // Commit an array of [ref, val] pairs in chunks of 490
        const commitChunks = async (ops) => {
          while (ops.length) {
            const chunk = ops.splice(0, 490);
            const b = writeBatch(db);
            chunk.forEach(([ref, val]) => b.set(ref, val));
            await b.commit();
          }
        };

        // Write each collection separately so failures are isolated
        const tasks = (data.tasks || []).map(t => [
          _userDoc('tasks', t.id),
          clean({ ...t, sortOrder: t.sortOrder ?? t.dateCreated ?? Date.now() }),
        ]);
        await commitChunks(tasks);

        const events = (data.events || []).map(t => [_userDoc('events', t.id), clean(t)]);
        await commitChunks(events);

        const meetings = (data.meetings || []).map(t => [_userDoc('meetings', t.id), clean(t)]);
        await commitChunks(meetings);

        const categories = (data.categories || []).map(t => [_userDoc('categories', t.id), clean(t)]);
        await commitChunks(categories);

        const habits = (data.habits || []).map(t => [_userDoc('habits', t.id), clean(t)]);
        await commitChunks(habits);

        const grateful   = Object.entries(data.grateful   || {}).map(([dk, v]) => [_userDoc('grateful',   dk), clean(v)]);
        const intentions = Object.entries(data.intentions || {}).map(([dk, v]) => [_userDoc('intentions', dk), clean(v)]);
        const briefings  = Object.entries(data.briefings  || {}).map(([dk, v]) => [_userDoc('briefings',  dk), clean(v)]);
        await commitChunks([...grateful, ...intentions, ...briefings]);

        _refreshFn?.();
        resolve();
      } catch (err) {
        console.error('Import error:', err);
        reject(new Error('Import failed: ' + err.message));
      }
    };
    reader.readAsText(file);
  });
}

// ── Clear all data ────────────────────────────────────────────────────────────
export function clearAllData() {
  _cache = { tasks: [], events: [], meetings: [], categories: [], habits: [], grateful: {}, intentions: {}, briefings: {}, reflections: {} };
  _refreshFn?.();
  COLLECTIONS.forEach(async col => {
    const snap  = await getDocs(_userCol(col));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  });
}

// ── No-ops for API compatibility ──────────────────────────────────────────────
export function migrate()   {}
export function saveTasks() {}
