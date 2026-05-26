# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, localhost:5173)
npm run build     # Production build
npm run preview   # Preview production build locally
```

No test suite or linter is configured.

## Architecture

Task Master is a personal productivity PWA: React 18 + Vite + Firebase (Firestore + Google Auth), deployed to Vercel.

### Data layer (`src/db.js`)

The entire data layer is a **module-level singleton cache**. This is the most important architectural fact in the codebase.

- `initDB(uid, onRefresh, onReady)` — sets up Firestore `onSnapshot` listeners for all 8 collections, populates the in-memory cache, and calls `onReady` when all 8 have loaded. Returns a cleanup function.
- All **reads are synchronous** (`getTasks()`, `getEvents()`, etc. read directly from the cache).
- All **writes update the cache immediately**, then persist to Firestore async. There is no loading state after the initial load.
- **Refresh pattern**: `db.js` holds a `_refreshFn` reference. After any write, it calls `_refreshFn()`, which is the `refresh` callback from `App`. That callback increments a `tick` counter. Components that need to re-read the cache use `tick` as a `key` prop or include it in `useMemo`/`useEffect` deps.
- **Safari workaround**: `initDB` also attaches `visibilitychange` and `online` listeners that force a full `getDocs` re-fetch, because Safari kills WebSocket connections in the background and doesn't always re-fire `onSnapshot` when the tab returns.

**Firestore path**: `users/{uid}/{collection}/{docId}`

**Collections**:
- Array collections (stored as flat lists): `tasks`, `events`, `meetings`, `categories`
- Map collections (keyed by `YYYY-MM-DD` date string, doc ID is the date): `grateful`, `intentions`, `briefings`, `reflections`

**Task schema**: `{ id, text, state, categoryId, dayKey, archived, sortOrder, log[], dueDate?, urgent?, description? }`
- `state`: `'todo' | 'backlog' | 'inprogress' | 'completed'`
- `dayKey`: `YYYY-MM-DD` — which day a `todo` task belongs to. `rolloverTodos()` advances stale dayKeys to today on login.
- `sortOrder`: timestamp-based float; midpoint insertion keeps ordering stable without renumbering.
- `log[]`: `{ id, type, note, loggedAt }` — immutable append-only history.

**Firestore constraint**: Never pass `undefined` values. The `clean()` helper (defined twice: in `initDB` closure and in `importData`) strips `undefined` → `null` via `JSON.parse(JSON.stringify(...))`.

### State management (`src/App.jsx`)

`App` owns all cross-page state. The key props passed down to pages:
- `viewDay` / `setViewDay` — which day the Daily page and Todo list show (YYYY-MM-DD)
- `refresh` / `tick` — trigger and signal for cache re-reads
- `openArchive(tab)` / `openLogPopup(taskId, type, onDone)` — callbacks to open overlays

Auth flow: `undefined` user = still checking, `null` = logged out, object = logged in. `initDB` is called inside the auth listener and torn down on sign-out.

Desktop navigation: four discrete pages (Daily → Todo → Active → Gigs), switchable via sidebar or Cmd+Arrow. Mobile: all four pages are rendered simultaneously in a vertical stack, with scroll-based navigation.

### Outliner (`src/components/shared/Outliner.jsx`)

The keyboard-driven task list used on the Todo and Active pages. Key behaviors:
- `scheduleOutlinerFocus(taskId)` — module-level flag that causes the Outliner to focus a specific task textarea after its next render pass. Used across page transitions.
- Tasks group by category; uncategorized tasks appear first. Categories with `urgent` tasks sort to the top.
- `onEnd` / `onStart` callbacks wire up cross-page keyboard navigation (arrow past the last/first task navigates to the adjacent page).
- Mobile renders an `AddTaskModal` (full-screen form with category picker, due date, urgency). Desktop uses inline inline-append on the add row.

### Pages

- **DailyPage** — three auto-saving notebook sections (Grateful, Intentions, Reflection) with 400ms debounce. Read-only when viewing a past day.
- **TodoPage** — two Outliners side-by-side: Backlog (`state: 'backlog'`) and To Do (`state: 'todo'`, filtered by `viewDay`).
- **ActivePage** — two Outliners: In Progress (`state: 'inprogress'`) and Completed (`state: 'completed'`).
- **GigsPage** — date-sorted Gigs (events) and Meetings lists with Google Calendar sync.

### Topics (categories)

Topics group tasks across all pages. Archiving a topic cascades to archive all its tasks. Deleting a topic permanently deletes all its tasks (see `deleteCategory` in `db.js`).

### Calendar integration (`src/calendar.js`)

Optional Google Calendar sync for gigs and meetings. OAuth access token stored in localStorage with a 59-minute TTL. On first sync, it creates (or finds) a "Task Master" calendar. A "Couples" calendar is located by a case-insensitive `includes('couple')` match on the calendar list. `calendarIds` stored on events/meetings track the Google Calendar event IDs for future updates/deletes.

### Archive Overlay

Right-panel drawer with 5 tabs: Activity (chronological task log feed from all tasks), Grateful, Intentions, Reflections (daily journal history), Events (completed/archived gigs and meetings). Keyboard: Escape closes, Left/Right arrows switch tabs.

### PWA

Configured with `vite-plugin-pwa` using the `injectManifest` strategy with a custom `src/sw.js`. The service worker is not active during `npm run dev`.
