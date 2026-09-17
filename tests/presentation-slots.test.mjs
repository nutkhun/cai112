import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import { createTestDatabase } from './helpers/database.mjs';

function setup(t) {
  const { DB, sqlite } = createTestDatabase();
  t.after(() => sqlite.close());
  return {
    sqlite,
    async insert(rows) {
      const response = await onRequest({
        env: { DB },
        request: new Request('http://localhost/api/db', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ table: 'presentation_slots', op: 'insert', rows }),
        }),
      });
      return { status: response.status, ...await response.json() };
    },
  };
}

const slot = (overrides = {}) => ({
  id: crypto.randomUUID(), exam_type: 'Midterm Presentation', slot_date: '2026-10-01',
  slot_time: '08:40', section: '458A', queue_no: 1, booked_group_id: null, ...overrides,
});

test('creates multiple dates for both exams, with notifications for every saved slot', async t => {
  const { insert, sqlite } = setup(t);
  const rows = ['Midterm Presentation', 'Final Project'].flatMap(exam_type =>
    ['2026-10-01', '2026-10-08'].map(slot_date => slot({ exam_type, slot_date })));
  const result = await insert(rows);
  assert.equal(result.status, 200);
  assert.equal(result.data.length, 4);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM _changes').get().n, 4);
  assert.deepEqual(result.data.map(row => row.queue_no), [1, 1, 1, 1]);
});

test('retries and duplicates preserve booked slots and skip duplicate notifications', async t => {
  const { insert, sqlite } = setup(t);
  const booked = slot({ booked_group_id: 'existing-group' });
  await insert([booked]);
  const result = await insert([slot({ slot_time: '08:40:00' }), slot(), slot({ slot_date: '2026-10-08' })]);
  assert.equal(result.status, 200);
  assert.equal(result.data.length, 1);
  assert.equal((await insert([booked])).data.length, 0);
  assert.equal(sqlite.prepare('SELECT booked_group_id FROM presentation_slots WHERE id = ?').get(booked.id).booked_group_id, 'existing-group');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM _changes').get().n, 2);
});

test('compares legacy second precision and null sections without conflating other sections', async t => {
  const { insert, sqlite } = setup(t);
  sqlite.prepare('INSERT INTO presentation_slots (id, exam_type, slot_date, slot_time, section) VALUES (?, ?, ?, ?, ?)')
    .run('legacy', 'Midterm Presentation', '2026-10-01', '08:40:00', null);
  const result = await insert([slot({ section: null }), slot(), slot({ section: '457A' })]);
  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data.map(row => row.section), ['458A', '457A']);
});

test('rejects an invalid date or time before writing any part of the schedule', async t => {
  const { insert, sqlite } = setup(t);
  for (const invalid of [{ slot_date: '2026-02-30' }, { slot_date: '' }, { slot_time: '25:00' }, { exam_type: 'Unknown' }]) {
    assert.equal((await insert([slot(), slot(invalid)])).status, 400);
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM presentation_slots').get().n, 0);
});

test('rolls back all slots and notifications if a database write fails mid-batch', async t => {
  const { insert, sqlite } = setup(t);
  const result = await insert([slot(), slot({ slot_date: '2026-10-08', queue_no: -1 })]);
  assert.equal(result.status, 400);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM presentation_slots').get().n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM _changes').get().n, 0);
});
