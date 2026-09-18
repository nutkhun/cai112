import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {readStudentLogin} from '../src/lib/student-login.ts';
const form=(overrides={})=>{const f=new FormData();for(const [key,value] of Object.entries({lastName:'Tester',studentId:'0012345678',section:'458B',pin:'0123',...overrides}))f.set(key,value);return f;};
test('reads all displayed login fields and preserves leading zeros',()=>{
 assert.deepEqual(readStudentLogin(form({lastName:' Tester ',studentId:' 0012345678 '})),{name:'Tester',studentId:'0012345678',section:'458B',pin:'0123'});
});
test('requires an explicit valid section instead of silently choosing 457A',()=>{
 for(const section of ['', '458C'])assert.match(readStudentLogin(form({section})).error,/select your section/);
 for(const section of ['457A','458A','458B'])assert.equal(readStudentLogin(form({section})).section,section);
});
test('rejects incomplete or invalid credentials',()=>{
 for(const pin of ['','123','12345','abcd'])assert.ok('error' in readStudentLogin(form({pin})));
 for(const field of ['lastName','studentId'])assert.ok('error' in readStudentLogin(form({[field]:''})));
});

const source=await readFile(new URL('../src/lib/browser-storage.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const load=async()=> (await import('data:text/javascript;base64,'+Buffer.from(compiled+'\n//'+crypto.randomUUID()).toString('base64'))).browserStorage;
function setup(t,storage){const old=globalThis.window;globalThis.window={get localStorage(){if(storage instanceof Error)throw storage;return storage;}};t.after(()=>{if(old===undefined)delete globalThis.window;else globalThis.window=old;});}
test('blocked storage permits a page session and a durable logout for that page',async t=>{
 setup(t,new Error('SecurityError'));const store=await load();
 assert.equal(store.getItem('session'),null);assert.doesNotThrow(()=>store.setItem('session','sample-id'));
 assert.equal(store.getItem('session'),'sample-id');store.removeItem('session');assert.equal(store.getItem('session'),null);
});
test('a full quota does not restore an old account after login or logout',async t=>{
 setup(t,{getItem:()=> 'old-id',setItem(){throw Error('QuotaExceeded');},removeItem(){throw Error('blocked');}});const store=await load();
 store.setItem('session','new-id');assert.equal(store.getItem('session'),'new-id');
 store.removeItem('session');assert.equal(store.getItem('session'),null);
});
test('normal browsers persist and clear sessions across page reloads',async t=>{
 const data=new Map();setup(t,{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)});
 (await load()).setItem('session','sample-id');assert.equal((await load()).getItem('session'),'sample-id');
 (await load()).removeItem('session');assert.equal((await load()).getItem('session'),null);
});
