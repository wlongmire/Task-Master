// Seed data — loaded once on first run if localStorage is empty
import { todayKey, offsetDate } from './db';

export function seedIfEmpty() {
  const existing = localStorage.getItem('taskmaster_data');
  if (existing && existing !== '{}') return;

  const today = todayKey();
  const yesterday = offsetDate(today, -1);
  const twoDaysAgo = offsetDate(today, -2);

  const now = Date.now();
  const t = (offset = 0) => now - offset * 60000; // minutes ago

  const data = {
    schemaVersion: 2,
    lastDay: today,

    grateful: {
      [today]: { text: 'Morning light through the window\nMade progress on the spec doc\nSister called — caught up for an hour', savedAt: t(30) },
      [yesterday]: { text: 'Had a great lunch with Tom\nFinished the Q2 draft earlier than expected', savedAt: t(1500) },
      [twoDaysAgo]: { text: 'Good conversation with Maya about the redesign', savedAt: t(2900) },
    },

    intentions: {
      [today]: { text: 'Learn to play guitar\nTravel to Japan — saving ~$4k by next spring\nA better desk chair\nMore mornings to read\nLearn proper Thai cooking', savedAt: t(45) },
    },

    categories: [
      { id: 'cat-work',     name: 'Work',          section: 'todo' },
      { id: 'cat-personal', name: 'Personal',       section: 'todo' },
      { id: 'cat-ideas',    name: 'Ideas',          section: 'backlog' },
      { id: 'cat-errands',  name: 'Errands',        section: 'backlog' },
      { id: 'cat-home',     name: 'Home Reno',      section: 'inprogress' },
    ],

    tasks: [
      // ── To Do ──
      {
        id: 'task-1', text: 'Finish Q2 report', state: 'todo', dayKey: today,
        categoryId: 'cat-work', urgent: false, dueDate: offsetDate(today, 2),
        dateCreated: t(600), archived: false,
        log: [{ id: 'l1', type: 'created', note: null, loggedAt: t(600) }],
      },
      {
        id: 'task-2', text: 'Prep slides for Friday standup', state: 'todo', dayKey: today,
        categoryId: 'cat-work', urgent: false, dueDate: offsetDate(today, 2),
        dateCreated: t(580), archived: false,
        log: [{ id: 'l2', type: 'created', note: null, loggedAt: t(580) }],
      },
      {
        id: 'task-3', text: 'Write spec doc', state: 'todo', dayKey: today,
        categoryId: 'cat-work', urgent: false,
        dateCreated: t(560), archived: false,
        log: [{ id: 'l3', type: 'created', note: null, loggedAt: t(560) }],
      },
      {
        id: 'task-4', text: 'Reply to Ben\'s email', state: 'todo', dayKey: today,
        categoryId: 'cat-personal', urgent: true,
        dateCreated: t(200), archived: false,
        log: [{ id: 'l4', type: 'created', note: null, loggedAt: t(200) }],
      },
      {
        id: 'task-5', text: 'Book dentist appointment', state: 'todo', dayKey: today,
        categoryId: 'cat-personal', urgent: false,
        dateCreated: t(180), archived: false,
        log: [{ id: 'l5', type: 'created', note: null, loggedAt: t(180) }],
      },

      // ── Backlog ──
      {
        id: 'task-6', text: 'Refactor task store', state: 'backlog',
        categoryId: 'cat-ideas', urgent: false,
        dateCreated: t(2000), archived: false,
        log: [{ id: 'l6', type: 'created', note: null, loggedAt: t(2000) }],
      },
      {
        id: 'task-7', text: 'Try out new headphones', state: 'backlog',
        categoryId: 'cat-ideas', urgent: false,
        dateCreated: t(1900), archived: false,
        log: [{ id: 'l7', type: 'created', note: null, loggedAt: t(1900) }],
      },
      {
        id: 'task-8', text: 'Pick up dry cleaning', state: 'backlog',
        categoryId: 'cat-errands', urgent: false,
        dateCreated: t(1800), archived: false,
        log: [{ id: 'l8', type: 'created', note: null, loggedAt: t(1800) }],
      },
      {
        id: 'task-9', text: 'Order vitamins', state: 'backlog',
        categoryId: 'cat-errands', urgent: false,
        dateCreated: t(1700), archived: false,
        log: [{ id: 'l9', type: 'created', note: null, loggedAt: t(1700) }],
      },
      {
        id: 'task-10', text: 'Gather tax receipts', state: 'backlog',
        categoryId: null, urgent: false,
        dateCreated: t(1600), archived: false,
        log: [{ id: 'l10', type: 'created', note: null, loggedAt: t(1600) }],
      },

      // ── In Progress ──
      {
        id: 'task-11', text: 'Redesign homepage', state: 'inprogress',
        categoryId: null, urgent: false,
        description: 'Waiting on copy from marketing. Need to finalize hero section.',
        dateCreated: t(8000), dateStarted: t(3000), archived: false,
        log: [
          { id: 'l11a', type: 'created', note: null, loggedAt: t(8000) },
          { id: 'l11b', type: 'started', note: null, loggedAt: t(3000) },
          { id: 'l11c', type: 'progress', note: 'Finished mobile layout, working on desktop', loggedAt: t(1200) },
        ],
      },
      {
        id: 'task-12', text: 'Read "Deep Work"', state: 'inprogress',
        categoryId: null, urgent: false,
        dateCreated: t(20000), dateStarted: t(10000), archived: false,
        log: [
          { id: 'l12a', type: 'created', note: null, loggedAt: t(20000) },
          { id: 'l12b', type: 'started', note: null, loggedAt: t(10000) },
          { id: 'l12c', type: 'progress', note: 'On chapter 4 — the deep work philosophy section', loggedAt: t(4000) },
        ],
      },
      {
        id: 'task-13', text: 'Pick paint colors', state: 'inprogress',
        categoryId: 'cat-home', urgent: false,
        dateCreated: t(15000), dateStarted: t(7000), archived: false,
        log: [
          { id: 'l13a', type: 'created', note: null, loggedAt: t(15000) },
          { id: 'l13b', type: 'started', note: null, loggedAt: t(7000) },
        ],
      },

      // ── Completed ──
      {
        id: 'task-14', text: 'Morning workout', state: 'completed',
        categoryId: 'cat-personal', urgent: false,
        dateCreated: t(500), dateStarted: t(480), dateCompleted: t(420), archived: false,
        log: [
          { id: 'l14a', type: 'created', note: null, loggedAt: t(500) },
          { id: 'l14b', type: 'started', note: null, loggedAt: t(480) },
          { id: 'l14c', type: 'done', note: null, loggedAt: t(420) },
        ],
      },
      {
        id: 'task-15', text: 'Pay rent', state: 'completed',
        categoryId: 'cat-personal', urgent: false,
        dateCreated: t(480), dateCompleted: t(390), archived: false,
        log: [
          { id: 'l15a', type: 'created', note: null, loggedAt: t(480) },
          { id: 'l15b', type: 'done', note: null, loggedAt: t(390) },
        ],
      },
      {
        id: 'task-16', text: 'Review PR #482', state: 'completed',
        categoryId: 'cat-work', urgent: false,
        dateCreated: t(350), dateCompleted: t(280), archived: false,
        log: [
          { id: 'l16a', type: 'created', note: null, loggedAt: t(350) },
          { id: 'l16b', type: 'done', note: 'Left comments on auth flow — needs one more pass', loggedAt: t(280) },
        ],
      },
      // yesterday completed
      {
        id: 'task-17', text: 'Submit expense report', state: 'completed',
        categoryId: 'cat-work', urgent: false,
        dateCreated: t(1600), dateCompleted: t(1440), archived: false,
        log: [
          { id: 'l17a', type: 'created', note: null, loggedAt: t(1600) },
          { id: 'l17b', type: 'done', note: null, loggedAt: t(1440) },
        ],
      },
      {
        id: 'task-18', text: 'Call insurance', state: 'completed',
        categoryId: 'cat-personal', urgent: false,
        dateCreated: t(1500), dateCompleted: t(1380), archived: false,
        log: [
          { id: 'l18a', type: 'created', note: null, loggedAt: t(1500) },
          { id: 'l18b', type: 'done', note: null, loggedAt: t(1380) },
        ],
      },
    ],

    events: [
      { id: 'evt-1', name: "Mom's birthday",   date: offsetDate(today, 2),  done: false, archived: false },
      { id: 'evt-2', name: 'Team offsite',      date: offsetDate(today, 21), notes: 'Denver — book flights by May 20', done: false, archived: false },
      { id: 'evt-3', name: '4th of July party', date: offsetDate(today, 52), done: false, archived: false },
      { id: 'evt-4', name: "Friend's wedding",  date: offsetDate(today, 101), notes: 'RSVP by July 15 · Hotel block at Marriott', done: false, archived: false },
      { id: 'evt-5', name: 'College reunion',   date: offsetDate(today, -23), done: true, archived: false },
    ],
  };

  localStorage.setItem('taskmaster_data', JSON.stringify(data));
}
