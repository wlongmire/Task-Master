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

const COLLECTIONS = ['tasks', 'events', 'meetings', 'categories', 'grateful', 'intentions', 'briefings', 'reflections'];

let _cache = {
  tasks: [], events: [], meetings: [], categories: [],
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
  _cache       = { tasks: [], events: [], meetings: [], categories: [], grateful: {}, intentions: {}, briefings: {}, reflections: {} };

  // Array collections
  for (const col of ['tasks', 'events', 'meetings', 'categories']) {
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
    const arrayCols = ['tasks', 'events', 'meetings', 'categories'];
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

  // Offline fallback — if Firestore hasn't delivered all 8 collections within
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
  setDoc(_userDoc('grateful', dk), clean(val));
}

// ── Intentions ────────────────────────────────────────────────────────────────
export function getIntentions(dk)       { return _cache.intentions[dk] || { text: '' }; }
export function getIntentionsDays()     { return Object.keys(_cache.intentions).filter(k => _cache.intentions[k].text).sort().reverse(); }
export function setIntentions(dk, text) {
  const val = { text, savedAt: Date.now() };
  _cache.intentions[dk] = val;
  setDoc(_userDoc('intentions', dk), clean(val));
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
  setDoc(_userDoc('reflections', dk), clean(val));
}
export function deleteReflectionEntry(dk, id) {
  const doc = _cache.reflections[dk];
  if (!doc || !doc.entries) return;
  const val = { entries: doc.entries.filter(e => e.id !== id), savedAt: Date.now() };
  _cache.reflections[dk] = val;
  setDoc(_userDoc('reflections', dk), clean(val));
}
export function updateReflectionEntry(dk, id, newText) {
  const doc = _cache.reflections[dk];
  if (!doc || !doc.entries) return;
  const val = { entries: doc.entries.map(e => e.id === id ? { ...e, text: newText } : e), savedAt: Date.now() };
  _cache.reflections[dk] = val;
  setDoc(_userDoc('reflections', dk), clean(val));
}
export function setReflection(dk, text) {
  const val = { text, savedAt: Date.now() };
  _cache.reflections[dk] = val;
  setDoc(_userDoc('reflections', dk), clean(val));
}

// ── Daily Briefing ────────────────────────────────────────────────────────────
export function getDailyBriefing(dk)          { return _cache.briefings[dk] || {}; }
export function setDailyBriefing(dk, updates) {
  const val = { ...(_cache.briefings[dk] || {}), ...updates };
  _cache.briefings[dk] = val;
  setDoc(_userDoc('briefings', dk), clean(val));
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
  setDoc(_userDoc('tasks', newTask.id), clean(newTask));
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
  setDoc(_userDoc('tasks', newTask.id), clean(newTask));
  _refreshFn?.();
  return newTask;
}

export function updateTask(id, updates) {
  const idx = _cache.tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  _cache.tasks[idx] = { ..._cache.tasks[idx], ...updates };
  updateDoc(_userDoc('tasks', id), clean(updates));
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
  deleteDoc(_userDoc('tasks', id));
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
  updateDoc(_userDoc('tasks', taskId), clean({ log: updatedLog }));
  _refreshFn?.();
  return entry;
}

export function rolloverTodos() {
  const today = todayKey();
  const stale = _cache.tasks.filter(t => !t.archived && t.state === 'todo' && t.dayKey && t.dayKey < today);
  stale.forEach(t => {
    t.dayKey = today;
    updateDoc(_userDoc('tasks', t.id), { dayKey: today });
  });
  if (stale.length) _refreshFn?.();
}

// ── Categories ────────────────────────────────────────────────────────────────
export function getCategories()         { return [..._cache.categories].filter(c => !c.archived); }
export function getArchivedCategories() { return [..._cache.categories].filter(c => c.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0)); }

export function addCategory(cat) {
  const newCat = { id: genId(), ...cat };
  _cache.categories = [..._cache.categories, newCat];
  setDoc(_userDoc('categories', newCat.id), clean(newCat));
  _refreshFn?.();
  return newCat;
}
export function updateCategory(id, updates) {
  const idx = _cache.categories.findIndex(c => c.id === id);
  if (idx === -1) return;
  _cache.categories[idx] = { ..._cache.categories[idx], ...updates };
  updateDoc(_userDoc('categories', id), clean(updates));
  _refreshFn?.();
}
export function archiveCategory(id) {
  const now = Date.now();
  _cache.tasks.forEach(t => {
    if (t.categoryId === id && !t.archived) {
      t.archived = true; t.archivedAt = now;
      updateDoc(_userDoc('tasks', t.id), { archived: true, archivedAt: now });
    }
  });
  const idx = _cache.categories.findIndex(c => c.id === id);
  if (idx !== -1) {
    _cache.categories[idx] = { ..._cache.categories[idx], archived: true, archivedAt: now };
    updateDoc(_userDoc('categories', id), { archived: true, archivedAt: now });
  }
  _refreshFn?.();
}
export function restoreCategory(id) {
  _cache.tasks.forEach(t => {
    if (t.categoryId === id && t.archived) {
      t.archived = false; t.archivedAt = null; t.state = 'todo';
      updateDoc(_userDoc('tasks', t.id), { archived: false, archivedAt: null, state: 'todo' });
    }
  });
  const idx = _cache.categories.findIndex(c => c.id === id);
  if (idx !== -1) {
    _cache.categories[idx] = { ..._cache.categories[idx], archived: false, archivedAt: null };
    updateDoc(_userDoc('categories', id), { archived: false, archivedAt: null });
  }
  _refreshFn?.();
}
export function deleteCategory(id) {
  // Cascade-delete all tasks belonging to this category
  _cache.tasks.filter(t => t.categoryId === id).forEach(t => deleteDoc(_userDoc('tasks', t.id)));
  _cache.tasks       = _cache.tasks.filter(t => t.categoryId !== id);
  _cache.categories  = _cache.categories.filter(c => c.id !== id);
  deleteDoc(_userDoc('categories', id));
  _refreshFn?.();
}

// ── Events / Gigs ─────────────────────────────────────────────────────────────
export function getEvents() { return [..._cache.events]; }

export function addEvent(evt) {
  const newEvt = { id: genId(), archived: false, done: false, ...evt };
  _cache.events = [..._cache.events, newEvt];
  setDoc(_userDoc('events', newEvt.id), clean(newEvt));
  _refreshFn?.();
  return newEvt;
}
export function updateEvent(id, updates) {
  const idx = _cache.events.findIndex(e => e.id === id);
  if (idx === -1) return;
  _cache.events[idx] = { ..._cache.events[idx], ...updates };
  updateDoc(_userDoc('events', id), clean(updates));
  _refreshFn?.();
}
export function archiveEvent(id) { updateEvent(id, { archived: true }); }
export function deleteEvent(id)  {
  _cache.events = _cache.events.filter(e => e.id !== id);
  deleteDoc(_userDoc('events', id));
  _refreshFn?.();
}

// ── Meetings ──────────────────────────────────────────────────────────────────
export function getMeetings() { return [..._cache.meetings]; }

export function addMeeting(mtg) {
  const newMtg = { id: genId(), archived: false, done: false, ...mtg };
  _cache.meetings = [..._cache.meetings, newMtg];
  setDoc(_userDoc('meetings', newMtg.id), clean(newMtg));
  _refreshFn?.();
  return newMtg;
}
export function updateMeeting(id, updates) {
  const idx = _cache.meetings.findIndex(m => m.id === id);
  if (idx === -1) return;
  _cache.meetings[idx] = { ..._cache.meetings[idx], ...updates };
  updateDoc(_userDoc('meetings', id), clean(updates));
  _refreshFn?.();
}
export function archiveMeeting(id) { updateMeeting(id, { archived: true }); }
export function deleteMeeting(id)  {
  _cache.meetings = _cache.meetings.filter(m => m.id !== id);
  deleteDoc(_userDoc('meetings', id));
  _refreshFn?.();
}

// ── Export ────────────────────────────────────────────────────────────────────
export function exportData() {
  const payload = JSON.stringify({
    schemaVersion: 2,
    tasks:      _cache.tasks,
    events:     _cache.events,
    meetings:   _cache.meetings,
    categories: _cache.categories,
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
  _cache = { tasks: [], events: [], meetings: [], categories: [], grateful: {}, intentions: {}, briefings: {} };
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
