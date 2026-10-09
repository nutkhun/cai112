import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import { createTestDatabase } from './helpers/database.mjs';

// Regression: a group that disbanded after booking a presentation slot left
// the slot pointing at a group id nothing could resolve. The teacher saw a
// nameless "Booked", students saw "Unavailable", and no one could ever take
// the slot again. Deleting a group must release its slots in the same batch.

function setup(t) {
  const { DB, sqlite } = createTestDatabase();
  sqlite.exec('CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT, leader_id TEXT)');
  t.after(() => sqlite.close());
  const call = async body => {
    const response = await onRequest({
      env: { DB },
      request: new Request('http://localhost/api/db', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    return { status: response.status, ...await response.json() };
  };
  const seedGroup = (id, name) =>
    sqlite.prepare('INSERT INTO groups (id, name, created_by) VALUES (?, ?, ?)').run(id, name, 'someone');
  const seedSlot = (id, booked_group_id, exam_type = 'Midterm Presentation') =>
    sqlite.prepare('INSERT INTO presentation_slots (id, exam_type, slot_date, slot_time, section, booked_group_id, queue_no) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, exam_type, '2026-10-01', '08:40', '458A', booked_group_id, 1);
  const bookedBy = id => sqlite.prepare('SELECT booked_group_id FROM presentation_slots WHERE id = ?').get(id).booked_group_id;
  // node:sqlite returns null-prototype rows; copy them so deepEqual compares values only.
  const changes = () => sqlite.prepare('SELECT tbl, op, row_id FROM _changes ORDER BY seq').all().map(row => ({ ...row }));
  return { call, seedGroup, seedSlot, bookedBy, changes, sqlite };
}

test('deleting a group releases every slot it held and leaves other bookings alone', async t => {
  const { call, seedGroup, seedSlot, bookedBy, changes } = setup(t);
  seedGroup('mee', 'mee group');
  seedGroup('kae', 'kae nee');
  seedSlot('s-mid', 'mee');
  seedSlot('s-final', 'mee', 'Final Project');
  seedSlot('s-other', 'kae');
  seedSlot('s-free', null);

  const result = await call({ table: 'groups', op: 'delete', filters: [{ col: 'id', op: 'eq', val: 'mee' }] });

  assert.equal(result.status, 200);
  assert.deepEqual(result.data.map(row => row.id), ['mee']);
  assert.equal(bookedBy('s-mid'), null, 'midterm slot released');
  assert.equal(bookedBy('s-final'), null, 'final slot released');
  assert.equal(bookedBy('s-other'), 'kae', 'another group\'s booking is untouched');
  assert.equal(bookedBy('s-free'), null);

  // Both the released slots and the deleted group hit the change feed, so open
  // dashboards refresh instead of showing a stale booking.
  assert.deepEqual(changes(), [
    { tbl: 'presentation_slots', op: 'UPDATE', row_id: 's-mid' },
    { tbl: 'presentation_slots', op: 'UPDATE', row_id: 's-final' },
    { tbl: 'groups', op: 'DELETE', row_id: 'mee' },
  ]);
});

test('deleting a group that holds no slot changes nothing else', async t => {
  const { call, seedGroup, seedSlot, bookedBy, changes } = setup(t);
  seedGroup('solo', 'solo');
  seedSlot('s-other', 'kae');

  const result = await call({ table: 'groups', op: 'delete', filters: [{ col: 'id', op: 'eq', val: 'solo' }] });

  assert.equal(result.status, 200);
  assert.equal(bookedBy('s-other'), 'kae');
  assert.deepEqual(changes(), [{ tbl: 'groups', op: 'DELETE', row_id: 'solo' }]);
});

test('deleting rows from any other table does not touch bookings', async t => {
  const { call, seedSlot, bookedBy, sqlite } = setup(t);
  sqlite.exec('CREATE TABLE join_requests (id TEXT PRIMARY KEY, student_id TEXT)');
  sqlite.prepare('INSERT INTO join_requests (id, student_id) VALUES (?, ?)').run('jr', 'mee');
  seedSlot('s-mid', 'mee');

  const result = await call({ table: 'join_requests', op: 'delete', filters: [{ col: 'id', op: 'eq', val: 'jr' }] });

  assert.equal(result.status, 200);
  assert.equal(bookedBy('s-mid'), 'mee');
});
