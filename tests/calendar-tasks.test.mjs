import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStore } from '../cloudflare/worker.mjs';
import '../static/domain.js';
const state=()=>Timesheet.extras({name:'Test',weeks:{}});
const task=(text='Outils récupérés',done=false)=>({text,done});
test('old backups acquire an empty task map; explicit empty lists remain empty',()=>{
 const s=validateStore({name:'Test',weeks:{}});assert.deepEqual(s.dayTasks,{});
 s.dayTasks['2026-11-02']={};assert.deepEqual(validateStore(JSON.parse(JSON.stringify(s))).dayTasks['2026-11-02'],{});
});
test('task data survives the server roundtrip and validates dates, lengths and types',()=>{
 const s=state();s.dayTasks['2028-02-29']={'default-tools':task('Outils',true)};
 assert.equal(validateStore(JSON.parse(JSON.stringify(s))).dayTasks['2028-02-29']['default-tools'].done,true);
 for(const tasks of [[],{'default-tools':{text:'',done:false}},{'default-tools':{text:'a',done:'yes'}},{'default-tools':task('x'.repeat(201))},{constructor:task()}]){
  const bad=state();bad.dayTasks['2026-11-02']=tasks;assert.throws(()=>validateStore(bad));
 }
 const bad=state();bad.dayTasks['2026-02-29']={};assert.throws(()=>validateStore(bad));
 const full=state();full.dayTasks['2026-11-02']=Object.fromEntries(Array.from({length:51},(_,i)=>['task-'+i,task()]));assert.throws(()=>validateStore(full));
});
test('two devices can check different tasks on the same day without losing either edit',()=>{
 const base=state();base.dayTasks['2026-11-02']={tools:task(),clean:task('Rangement')};const local=structuredClone(base),remote=structuredClone(base);
 local.dayTasks['2026-11-02'].tools.done=true;remote.dayTasks['2026-11-02'].clean.done=true;
 const merged=Timesheet.merge(base,local,remote);assert.equal(merged.dayTasks['2026-11-02'].tools.done,true);assert.equal(merged.dayTasks['2026-11-02'].clean.done,true);
});
test('task deletion merges with a separate task edit; conflicts on the same task stay visible',()=>{
 const base=state();base.dayTasks['2026-11-02']={tools:task(),clean:task('Rangement')};const local=structuredClone(base),remote=structuredClone(base);
 delete local.dayTasks['2026-11-02'].tools;remote.dayTasks['2026-11-02'].clean.done=true;
 const merged=Timesheet.merge(base,local,remote);assert.equal(merged.dayTasks['2026-11-02'].tools,undefined);assert.equal(merged.dayTasks['2026-11-02'].clean.done,true);
 remote.dayTasks['2026-11-02'].tools.done=true;assert.equal(Timesheet.merge(base,local,remote),null);
});
