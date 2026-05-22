import { auth, googleProvider } from './firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const TOKEN_KEY  = 'cal_token';
const EXPIRY_KEY = 'cal_expiry';

let _token   = null;
let _expiry  = 0;
let _tmCalId = null;      // Task Master calendar ID (cached)
let _calCalId = undefined; // Couples calendar ID (undefined=unsearched, null=not found)

export function setCalendarToken(token) {
  _token  = token;
  _expiry = Date.now() + 3540 * 1000; // 59 min
  localStorage.setItem(TOKEN_KEY,  token);
  localStorage.setItem(EXPIRY_KEY, String(_expiry));
}

function loadStoredToken() {
  const t = localStorage.getItem(TOKEN_KEY);
  const e = Number(localStorage.getItem(EXPIRY_KEY) || 0);
  if (t && Date.now() < e) { _token = t; _expiry = e; }
}

export function calendarReady() {
  if (!_token) loadStoredToken();
  return !!_token && Date.now() < _expiry;
}

async function ensureToken() {
  if (calendarReady()) return;
  const result = await signInWithPopup(auth, googleProvider);
  const cred   = GoogleAuthProvider.credentialFromResult(result);
  setCalendarToken(cred.accessToken);
}

async function calFetch(method, path, body) {
  await ensureToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `Calendar API ${res.status}`);
  }
  return res.json();
}

export async function ensureTaskMasterCalendar() {
  if (_tmCalId) return _tmCalId;
  const list = await calFetch('GET', '/users/me/calendarList');
  const found = list.items.find(c => c.summary === 'Task Master');
  _tmCalId = found
    ? found.id
    : (await calFetch('POST', '/calendars', { summary: 'Task Master' })).id;
  return _tmCalId;
}

export async function findCouplesCalendar() {
  if (_calCalId !== undefined) return _calCalId;
  const list = await calFetch('GET', '/users/me/calendarList');
  const found = list.items.find(c => c.summary.toLowerCase().includes('couple'));
  _calCalId = found?.id ?? null;
  return _calCalId;
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function toGCalEvent(item) {
  const ev = { summary: item.name };
  if (item.notes)    ev.description = item.notes;
  if (item.location) ev.location    = item.location;

  if (item.time) {
    const timeNorm = item.time.slice(0, 5); // Normalize to HH:MM (handles HH:MM:SS from some browsers)
    const start = new Date(`${item.date}T${timeNorm}:00`);
    if (isNaN(start.getTime())) {
      console.warn('toGCalEvent: invalid datetime', item.date, item.time);
      ev.start = { date: item.date };
      const next = new Date(item.date + 'T00:00:00');
      next.setDate(next.getDate() + 1);
      ev.end = { date: next.toISOString().slice(0, 10) };
      return ev;
    }
    const end   = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt   = d =>
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` +
      `T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
    ev.start = { dateTime: fmt(start), timeZone: tz };
    ev.end   = { dateTime: fmt(end),   timeZone: tz };
  } else {
    const next = new Date(item.date + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    ev.start = { date: item.date };
    ev.end   = { date: next.toISOString().slice(0, 10) };
  }
  return ev;
}

export async function syncToCalendar(item, addToCouples) {
  const evData  = toGCalEvent(item);
  const tmId    = await ensureTaskMasterCalendar();
  const prevIds = item.calendarIds || {};
  const result  = {};

  // Task Master calendar
  if (prevIds.taskMaster) {
    await calFetch('PUT', `/calendars/${encodeURIComponent(tmId)}/events/${prevIds.taskMaster}`, evData);
    result.taskMaster = prevIds.taskMaster;
  } else {
    result.taskMaster = (await calFetch('POST', `/calendars/${encodeURIComponent(tmId)}/events`, evData)).id;
  }

  // Couples calendar
  if (addToCouples) {
    const cId = await findCouplesCalendar();
    if (cId) {
      if (prevIds.couples) {
        await calFetch('PUT', `/calendars/${encodeURIComponent(cId)}/events/${prevIds.couples}`, evData);
        result.couples = prevIds.couples;
      } else {
        result.couples = (await calFetch('POST', `/calendars/${encodeURIComponent(cId)}/events`, evData)).id;
      }
    }
  } else if (prevIds.couples) {
    // toggled off — remove from couples
    const cId = await findCouplesCalendar();
    if (cId) await calFetch('DELETE', `/calendars/${encodeURIComponent(cId)}/events/${prevIds.couples}`).catch(() => {});
  }

  return result;
}

export async function removeFromCalendar(item) {
  const ids = item.calendarIds || {};
  if (!ids.taskMaster && !ids.couples) return;
  try {
    const tmId = await ensureTaskMasterCalendar();
    if (ids.taskMaster) await calFetch('DELETE', `/calendars/${encodeURIComponent(tmId)}/events/${ids.taskMaster}`).catch(() => {});
    if (ids.couples) {
      const cId = await findCouplesCalendar();
      if (cId) await calFetch('DELETE', `/calendars/${encodeURIComponent(cId)}/events/${ids.couples}`).catch(() => {});
    }
  } catch (e) {
    console.warn('Calendar remove failed:', e);
  }
}
