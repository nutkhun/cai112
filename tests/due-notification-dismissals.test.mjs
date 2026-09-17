import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/due-notification-dismissals.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const load = () => import('data:text/javascript;base64,' + Buffer.from(compiled + '\n//' + crypto.randomUUID()).toString('base64'));
const deadline = {id: 'assignment-1', due_date: '2026-09-18'};

function browser(t) {
  const previous = globalThis.window;
  const values = new Map();
  const target = new EventTarget();
  target.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.window = target;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return target;
}

test('dismissal survives a fresh module/page and remains scoped to its student', async t => {
  browser(t);
  const first = await load();
  const key = first.dueNotificationKey(deadline);
  first.dismissDueNotifications('student-a', [key]);
  const reloaded = await load();
  assert.ok(reloaded.parseDismissals(reloaded.dismissalSnapshot('student-a')).has(key));
  assert.equal(reloaded.parseDismissals(reloaded.dismissalSnapshot('student-b')).size, 0);
  assert.equal(reloaded.dismissalSnapshot(undefined), '[]');
});

test('new assignments and changed deadlines remain visible; day/stage changes do not revive a dismissal', async t => {
  browser(t);
  const store = await load();
  store.dismissDueNotifications('student-a', [store.dueNotificationKey(deadline)]);
  const dismissed = store.parseDismissals(store.dismissalSnapshot('student-a'));
  assert.ok(dismissed.has(store.dueNotificationKey({...deadline, daysUntilDue: -21})));
  assert.ok(!dismissed.has(store.dueNotificationKey({...deadline, due_date: '2026-09-25'})));
  assert.ok(!dismissed.has(store.dueNotificationKey({...deadline, id: 'assignment-2'})));
});

test('closing multiple reminders merges with existing acknowledgements', async t => {
  browser(t);
  const store = await load();
  store.dismissDueNotifications('student-a', ['first']);
  store.dismissDueNotifications('student-a', ['second', 'third', 'first']);
  assert.deepEqual([...store.parseDismissals(store.dismissalSnapshot('student-a'))], ['first', 'second', 'third']);
});

test('malformed browser storage does not break reminders', async t => {
  browser(t);
  const store = await load();
  for (const value of ['broken', 'null', '{}', '42']) assert.equal(store.parseDismissals(value).size, 0);
  assert.deepEqual([...store.parseDismissals('["valid",42,null]')], ['valid']);
});

test('blocked or full storage still dismisses for the current page', async t => {
  const win = browser(t);
  const store = await load();
  store.dismissDueNotifications('student-a', ['existing']);
  win.localStorage.setItem = () => { throw Error('quota'); };
  store.dismissDueNotifications('student-a', ['new']);
  assert.deepEqual([...store.parseDismissals(store.dismissalSnapshot('student-a'))], ['existing', 'new']);
  win.localStorage.getItem = () => { throw Error('blocked'); };
  store.dismissDueNotifications('student-b', ['other']);
  assert.ok(store.parseDismissals(store.dismissalSnapshot('student-b')).has('other'));
});

test('same-page and cross-tab changes notify subscribers and cleanup removes listeners', async t => {
  const win = browser(t);
  const store = await load();
  let updates = 0;
  const unsubscribe = store.subscribeToDismissals(() => updates++);
  store.dismissDueNotifications('student-a', ['one']);
  win.dispatchEvent(new Event('storage'));
  assert.equal(updates, 2);
  unsubscribe();
  store.dismissDueNotifications('student-a', ['two']);
  assert.equal(updates, 2);
});
