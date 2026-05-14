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

// ── Local cache ───────────────────────────────────────────────────────────────
let _uid       = null;
let _refreshFn = null;
let _onReadyFn = null;
let _unsubs    = [];
let _loaded    = new Set();

const COLLECTIONS = ['tasks', 'events', 'meetings', 'categories', 'grateful', 'intentions', 'briefings'];

let _cache = {
  tasks: [], events: [], meetings: [], categories: [],
  grateful: {}, intentions: {}, briefings: {},
};

function _userCol(name)       { return collection(db, 'users', _uid, name); }
function _userDoc(col, docId) { return doc(db, 'users', _uid, col, docId); }

function _markLoaded(name) {
  const wasReady = _loaded.size >= COLLECTIONS.length;
  _loaded.add(name);
  const nowReady = _loaded.size >= COLLECTIONS.length;
  if (nowReady && !wasReady) { _onReadyFn?.(); _refreshFn?.(); }
  else if (nowReady)           { _refreshFn?.(); }
}

// ── Init / Cleanup ────────────────────────────────────────────────────────────
export function initDB(uid, onRefresh, onReady) {
  // tear down any previous session
  _unsubs.forEach(fn => fn());
  _unsubs    = [];
  _loaded    = new Set();
  _uid       = uid;
  _refreshFn = onRefresh;
  _onReadyFn = onReady;
  _cache     = { tasks: [], events: [], meetings: [], categories: [], grateful: {}, intentions: {}, briefings: {} };

  // Array collections
  for (const col of ['tasks', 'events', 'meetings', 'categories']) {
    const unsub = onSnapshot(_userCol(col), snap => {
      _cache[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _markLoaded(col);
    }, err => console.error('Firestore', col, err));
    _unsubs.push(unsub);
  }

  // Map collections (keyed by date)
  for (const col of ['grateful', 'intentions', 'briefings']) {
    const unsub = onSnapshot(_userCol(col), snap => {
      _cache[col] = {};
      snap.docs.forEach(d => { _cache[col][d.id] = d.data(); });
      _markLoaded(col);
    }, err => console.error('Firestore', col, err));
    _unsubs.push(unsub);
  }

  return () => {
    _unsubs.forEach(fn => fn());
    _unsubs = []; _uid = null; _refreshFn = null; _onReadyFn = null;
    _loaded = new Set();
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
  setDoc(_userDoc('grateful', dk), val);
}

// ── Intentions ────────────────────────────────────────────────────────────────
export function getIntentions(dk)       { return _cache.intentions[dk] || { text: '' }; }
export function getIntentionsDays()     { return Object.keys(_cache.intentions).filter(k => _cache.intentions[k].text).sort().reverse(); }
export function setIntentions(dk, text) {
  const val = { text, savedAt: Date.now() };
  _cache.intentions[dk] = val;
  setDoc(_userDoc('intentions', dk), val);
}

// ── Daily Briefing ────────────────────────────────────────────────────────────
export function getDailyBriefing(dk)          { return _cache.briefings[dk] || {}; }
export function setDailyBriefing(dk, updates) {
  const val = { ...(_cache.briefings[dk] || {}), ...updates };
  _cache.briefings[dk] = val;
  setDoc(_userDoc('briefings', dk), val);
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
  setDoc(_userDoc('tasks', newTask.id), newTask);
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
  setDoc(_userDoc('tasks', newTask.id), newTask);
  _refreshFn?.();
  return newTask;
}

export function updateTask(id, updates) {
  const idx = _cache.tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  _cache.tasks[idx] = { ..._cache.tasks[idx], ...updates };
  updateDoc(_userDoc('tasks', id), updates);
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
  updateDoc(_userDoc('tasks', taskId), { log: updatedLog });
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
export function getCategories() { return [..._cache.categories]; }

export function addCategory(cat) {
  const newCat = { id: genId(), ...cat };
  _cache.categories = [..._cache.categories, newCat];
  setDoc(_userDoc('categories', newCat.id), newCat);
  _refreshFn?.();
  return newCat;
}
export function updateCategory(id, updates) {
  const idx = _cache.categories.findIndex(c => c.id === id);
  if (idx === -1) return;
  _cache.categories[idx] = { ..._cache.categories[idx], ...updates };
  updateDoc(_userDoc('categories', id), updates);
  _refreshFn?.();
}
export function deleteCategory(id) {
  _cache.categories = _cache.categories.filter(c => c.id !== id);
  deleteDoc(_userDoc('categories', id));
  _refreshFn?.();
}

// ── Events / Gigs ─────────────────────────────────────────────────────────────
export function getEvents() { return [..._cache.events]; }

export function addEvent(evt) {
  const newEvt = { id: genId(), archived: false, done: false, ...evt };
  _cache.events = [..._cache.events, newEvt];
  setDoc(_userDoc('events', newEvt.id), newEvt);
  _refreshFn?.();
  return newEvt;
}
export function updateEvent(id, updates) {
  const idx = _cache.events.findIndex(e => e.id === id);
  if (idx === -1) return;
  _cache.events[idx] = { ..._cache.events[idx], ...updates };
  updateDoc(_userDoc('events', id), updates);
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
  setDoc(_userDoc('meetings', newMtg.id), newMtg);
  _refreshFn?.();
  return newMtg;
}
export function updateMeeting(id, updates) {
  const idx = _cache.meetings.findIndex(m => m.id === id);
  if (idx === -1) return;
  _cache.meetings[idx] = { ..._cache.meetings[idx], ...updates };
  updateDoc(_userDoc('meetings', id), updates);
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

        const ops = [];
        (data.tasks      || []).forEach(t => ops.push([_userDoc('tasks',      t.id), { ...t, sortOrder: t.sortOrder ?? t.dateCreated ?? Date.now() }]));
        (data.events     || []).forEach(t => ops.push([_userDoc('events',     t.id), t]));
        (data.meetings   || []).forEach(t => ops.push([_userDoc('meetings',   t.id), t]));
        (data.categories || []).forEach(t => ops.push([_userDoc('categories', t.id), t]));
        Object.entries(data.grateful   || {}).forEach(([dk, v]) => ops.push([_userDoc('grateful',   dk), v]));
        Object.entries(data.intentions || {}).forEach(([dk, v]) => ops.push([_userDoc('intentions', dk), v]));
        Object.entries(data.briefings  || {}).forEach(([dk, v]) => ops.push([_userDoc('briefings',  dk), v]));

        // Commit in chunks of 490 (Firestore limit is 500 per batch)
        while (ops.length) {
          const chunk = ops.splice(0, 490);
          const b = writeBatch(db);
          chunk.forEach(([ref, val]) => b.set(ref, val));
          await b.commit();
        }
        resolve();
      } catch (err) {
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
