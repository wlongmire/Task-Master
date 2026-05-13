// ─── Task Master DB ───────────────────────────────────────────────────────────
// Pure localStorage functions. No React dependency.

const STORAGE_KEY = 'taskmaster_data';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Dates ──
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function todayKey() { return dateKey(new Date()); }
export function offsetDate(dk, days) {
  const d = new Date(dk + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export function formatDateShort(dk) {
  const d = new Date(dk + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Grateful ──
export function getGrateful(dk) {
  const data = load();
  return (data.grateful && data.grateful[dk]) || { text: '' };
}
export function setGrateful(dk, text) {
  const data = load();
  if (!data.grateful) data.grateful = {};
  data.grateful[dk] = { text, savedAt: Date.now() };
  save(data);
}
export function getGratefulDays() {
  const data = load();
  if (!data.grateful) return [];
  return Object.keys(data.grateful).filter(k => data.grateful[k].text).sort().reverse();
}

// ── Intentions (formerly Wants) ──
export function getIntentions(dk) {
  const data = load();
  // migrate old 'wants' key
  if (!data.intentions && data.wants) {
    if (typeof data.wants === 'object' && !data.wants.history) {
      data.intentions = data.wants;
    }
  }
  return (data.intentions && data.intentions[dk]) || { text: '' };
}
export function setIntentions(dk, text) {
  const data = load();
  if (!data.intentions) data.intentions = {};
  data.intentions[dk] = { text, savedAt: Date.now() };
  save(data);
}
export function getIntentionsDays() {
  const data = load();
  if (!data.intentions) return [];
  return Object.keys(data.intentions).filter(k => data.intentions[k].text).sort().reverse();
}

// ── Tasks ──
function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export function getTasks() {
  return load().tasks || [];
}
export function saveTasks(tasks) {
  const data = load();
  data.tasks = tasks;
  save(data);
}
export function addTask(task) {
  const tasks = getTasks();
  const now = Date.now();
  const newTask = {
    id: genId(),
    dateCreated: now,
    archived: false,
    log: [{ id: now + '-c', type: 'created', note: null, loggedAt: now }],
    ...task,
  };
  tasks.push(newTask);
  saveTasks(tasks);
  return newTask;
}
export function updateTask(id, updates) {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  tasks[idx] = { ...tasks[idx], ...updates };
  saveTasks(tasks);
}
export function moveTask(id, newState) {
  const updates = { state: newState };
  if (newState === 'completed') updates.dateCompleted = Date.now();
  if (newState === 'inprogress') updates.dateStarted = Date.now();
  if (newState === 'todo' || newState === 'backlog') {
    updates.dateStarted = null;
    updates.dateCompleted = null;
  }
  updateTask(id, updates);
}
export function archiveTask(id) {
  updateTask(id, { archived: true, archivedAt: Date.now() });
}
export function restoreTask(id, dayKey) {
  updateTask(id, { state: 'todo', dayKey, dateCompleted: null, archived: false });
}
export function getArchivedTasks() {
  return getTasks().filter(t => t.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
}
export function addLogEntry(taskId, { type, note = null }) {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;
  const entry = { id: String(Date.now()), type, note, loggedAt: Date.now() };
  if (!tasks[idx].log) tasks[idx].log = [];
  tasks[idx].log.push(entry);
  saveTasks(tasks);
  return entry;
}

// ── Categories ──
export function getCategories() {
  return load().categories || [];
}
export function addCategory(cat) {
  const data = load();
  if (!data.categories) data.categories = [];
  const newCat = { id: genId(), ...cat };
  data.categories.push(newCat);
  save(data);
  return newCat;
}
export function updateCategory(id, updates) {
  const data = load();
  if (!data.categories) return;
  const idx = data.categories.findIndex(c => c.id === id);
  if (idx !== -1) data.categories[idx] = { ...data.categories[idx], ...updates };
  save(data);
}
export function deleteCategory(id) {
  const data = load();
  if (!data.categories) return;
  data.categories = data.categories.filter(c => c.id !== id);
  save(data);
}

// ── Events / Gigs ──
export function getEvents() {
  return load().events || [];
}
export function addEvent(evt) {
  const data = load();
  if (!data.events) data.events = [];
  const newEvt = { id: genId(), archived: false, done: false, ...evt };
  data.events.push(newEvt);
  save(data);
  return newEvt;
}
export function updateEvent(id, updates) {
  const data = load();
  if (!data.events) return;
  const idx = data.events.findIndex(e => e.id === id);
  if (idx !== -1) data.events[idx] = { ...data.events[idx], ...updates };
  save(data);
}
export function archiveEvent(id) {
  updateEvent(id, { archived: true });
}

// ── Daily Briefing ──
export function getDailyBriefing(dk) {
  const data = load();
  return (data.briefings && data.briefings[dk]) || {};
}
export function setDailyBriefing(dk, updates) {
  const data = load();
  if (!data.briefings) data.briefings = {};
  data.briefings[dk] = { ...(data.briefings[dk] || {}), ...updates };
  save(data);
}

// ── Rollover: bump stale todo tasks to today ──
export function rolloverTodos() {
  const today = todayKey();
  const tasks = getTasks();
  let changed = false;
  tasks.forEach(t => {
    if (!t.archived && t.state === 'todo' && t.dayKey && t.dayKey < today) {
      t.dayKey = today;
      changed = true;
    }
  });
  if (changed) saveTasks(tasks);
}

// ── Schema migration v1 → v2 ──
export function migrate() {
  const data = load();
  if ((data.schemaVersion || 1) >= 2) return;
  (data.tasks || []).forEach(t => {
    if (t.notes !== undefined) delete t.notes;
    if (!t.log) {
      const log = [];
      if (t.dateCreated) log.push({ id: t.dateCreated + '-c', type: 'created', note: null, loggedAt: t.dateCreated });
      if (t.dateStarted) log.push({ id: t.dateStarted + '-s', type: 'started', note: null, loggedAt: t.dateStarted });
      (t.partialLogs || []).forEach(pl => log.push({ id: pl.id, type: 'progress', note: pl.note, loggedAt: pl.loggedAt }));
      if (t.dateCompleted) log.push({ id: t.dateCompleted + '-d', type: 'done', note: null, loggedAt: t.dateCompleted });
      log.sort((a, b) => a.loggedAt - b.loggedAt);
      t.log = log;
      delete t.partialLogs;
    }
    // rename 'nextup' state to 'backlog'
    if (t.state === 'nextup') t.state = 'backlog';
  });
  data.schemaVersion = 2;
  save(data);
}

// ── Export ──
export function exportData() {
  const raw = localStorage.getItem(STORAGE_KEY) || '{}';
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `taskmaster-${dateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
