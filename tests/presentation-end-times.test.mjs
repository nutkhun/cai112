import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/[[path]].js';
import {inferLegacyEndTime, SECTION_WINDOWS, toMinutes, toTime} from '../src/lib/presentation-slots.ts';
import {createTestDatabase} from './helpers/database.mjs';

function setup(t){const env=createTestDatabase();t.after(()=>env.sqlite.close());return {...env,async call(body){const r=await onRequest({env,request:new Request('http://local/api/db',{method:'POST',body:JSON.stringify({table:'presentation_slots',...body})})});return {status:r.status,...await r.json()};}};}
const row=(overrides={})=>({id:crypto.randomUUID(),exam_type:'Midterm Presentation',slot_date:'2026-10-02',slot_time:'12:00',section:'457A',queue_no:1,booked_group_id:null,...overrides});
const seed=(db,rows)=>{for(const r of rows)db.prepare('INSERT INTO presentation_slots(id,exam_type,slot_date,slot_time,section,queue_no,booked_group_id) VALUES(?,?,?,?,?,?,?)').run(r.id,r.exam_type,r.slot_date,r.slot_time,r.section,r.queue_no,r.booked_group_id);};

test('migration preserves all 42 legacy records and bookings; end times survive missing neighboring slots',async t=>{
 const {sqlite,call}=setup(t);const rows=[];
 for(const section of Object.keys(SECTION_WINDOWS))for(const slot_date of ['2026-10-02','2026-10-09'])for(let i=0;i<7;i++)rows.push(row({section,slot_date,slot_time:toTime(toMinutes(SECTION_WINDOWS[section].start)+i*20),queue_no:i+1,booked_group_id:i===0?'existing-group':null}));
 seed(sqlite,rows);sqlite.exec("CREATE TABLE students(id TEXT, name TEXT); INSERT INTO students VALUES('sentinel','unchanged')");
 const before=sqlite.prepare('SELECT * FROM presentation_slots ORDER BY id').all();
 const result=await call({op:'select'});assert.equal(result.status,200);assert.equal(result.data.length,42);
 const after=sqlite.prepare('SELECT * FROM presentation_slots ORDER BY id').all();
 assert.deepEqual(after.map(({slot_end_time,...rest})=>rest),before.map(r=>({...r})));
 for(const r of after)assert.equal(r.slot_end_time,toTime(toMinutes(r.slot_time)+20));
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM _changes').get().n,42);
 await call({op:'select'});assert.equal(sqlite.prepare('SELECT count(*) AS n FROM _changes').get().n,42);
 assert.equal(sqlite.prepare('SELECT name FROM students').get().name,'unchanged');
 const kept=after[0];sqlite.prepare('DELETE FROM presentation_slots WHERE id != ?').run(kept.id);
 assert.equal((await call({op:'select'})).data[0].slot_end_time,kept.slot_end_time);
});

test('new slots retain exact end times for variable durations and retries preserve them',async t=>{
 const {call}=setup(t);
 const rows=[row({slot_time:'14:30',slot_end_time:'14:45',section:'458B'}),row({slot_time:'16:30',slot_end_time:'16:45',section:'458B',queue_no:9}),row({exam_type:'Final Project',slot_time:'12:00',slot_end_time:'12:25',section:null})];
 const result=await call({op:'insert',rows});assert.equal(result.status,200);assert.deepEqual(result.data.map(r=>r.slot_end_time),['14:45','16:45','12:25']);
 const duplicate=await call({op:'insert',rows:[{...rows[0],id:crypto.randomUUID(),slot_end_time:'15:00'}]});assert.equal(duplicate.data.length,0);
 const booked=await call({op:'update',values:{booked_group_id:'my-group'},filters:[{col:'id',op:'eq',val:rows[0].id}]});
 assert.equal(booked.data[0].slot_end_time,'14:45');assert.equal(booked.data[0].booked_group_id,'my-group');
});

test('invalid end times reject the entire new slot batch',async t=>{
 const {call,sqlite}=setup(t);
 for(const slot_end_time of ['12:00','11:59','25:00','12:60','', '13:00:01']){
  const result=await call({op:'insert',rows:[row({slot_end_time:'12:20'}),row({slot_date:'2026-10-09',slot_end_time})]});
  assert.equal(result.status,400);
 }
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM presentation_slots').get().n,0);
});

test('legacy inference respects queue gaps and refuses ambiguous intervals',()=>{
 const a=row(),b=row({slot_time:'12:40',queue_no:3}),c=row({slot_time:'13:00',queue_no:4});
 assert.equal(inferLegacyEndTime(a,[a,b,c]),'12:20');assert.equal(inferLegacyEndTime(c,[a,b,c]),'13:20');
 assert.equal(inferLegacyEndTime(a,[a]),null);
 assert.equal(inferLegacyEndTime(a,[a,{...b,slot_time:'12:30'},c]),null);
 assert.equal(inferLegacyEndTime({...a,queue_no:null},[a,b,c]),null);
 assert.equal(inferLegacyEndTime(a,[a,{...b,section:'458B'},{...c,slot_date:'2026-10-09'}]),null);
});

test('failed legacy backfill rolls back all metadata and can safely retry',async t=>{
 const {sqlite,call}=setup(t);const a=row({id:'a',booked_group_id:'keep-me'}),b=row({id:'b',slot_time:'12:20',queue_no:2});seed(sqlite,[a,b]);
 sqlite.exec("ALTER TABLE presentation_slots ADD COLUMN slot_end_time TEXT; CREATE TRIGGER fail_end BEFORE UPDATE OF slot_end_time ON presentation_slots WHEN NEW.id='b' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 assert.equal((await call({op:'select'})).status,400);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM presentation_slots WHERE slot_end_time IS NOT NULL').get().n,0);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM _changes').get().n,0);
 assert.equal(sqlite.prepare("SELECT booked_group_id FROM presentation_slots WHERE id='a'").get().booked_group_id,'keep-me');
 sqlite.exec('DROP TRIGGER fail_end');assert.equal((await call({op:'select'})).status,200);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM presentation_slots WHERE slot_end_time IS NOT NULL').get().n,2);
});
