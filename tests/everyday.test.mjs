import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStore } from '../cloudflare/worker.mjs';
import '../static/domain.js';
const state=()=>Timesheet.extras({name:'Test',weeks:{'2026-11-02':Array.from({length:7},()=>[])}});
test('old accounts migrate without inventing notes or completed days',()=>{
 const s=validateStore(state());assert.deepEqual(s.learningNotes,{});assert.deepEqual(s.completedDays,{});
});
test('learning notes and completion survive the server JSON roundtrip and reject invalid data',()=>{
 const s=state();s.learningNotes['2026-11-03']='Lecture de schéma';s.completedDays['2026-11-03']='1234abcd';
 const restored=validateStore(JSON.parse(JSON.stringify(s)));assert.equal(restored.learningNotes['2026-11-03'],'Lecture de schéma');assert.equal(restored.completedDays['2026-11-03'],'1234abcd');
 for(const [field,key,value] of [['learningNotes','2026-11-31','a'],['learningNotes','2026-11-03','x'.repeat(2001)],['completedDays','2026-11-03','not-a-signature'],['completedDays','2026-11-03',12345678]]){
  const invalid=state();invalid[field][key]=value;assert.throws(()=>validateStore(invalid));
 }
});
test('different devices merge notes and checks by date without silently dropping edits',()=>{
 const base=state(),local=state(),remote=state();local.learningNotes['2026-11-02']='Câblage';remote.learningNotes['2026-11-03']='Dépannage';local.completedDays['2026-11-02']='1234abcd';remote.completedDays['2026-11-03']='5678abcd';
 const merged=Timesheet.merge(base,local,remote);assert.deepEqual(merged.learningNotes,{'2026-11-02':'Câblage','2026-11-03':'Dépannage'});assert.equal(Object.keys(merged.completedDays).length,2);
 remote.learningNotes['2026-11-02']='Autre modification';assert.equal(Timesheet.merge(base,local,remote),null);
});
test('deleting a learning note merges with an independent check on another device',()=>{
 const base=state();base.learningNotes['2026-11-02']='Ancienne note';const local=structuredClone(base),remote=structuredClone(base);delete local.learningNotes['2026-11-02'];remote.completedDays['2026-11-03']='5678abcd';
 const merged=Timesheet.merge(base,local,remote);assert.deepEqual(merged.learningNotes,{});assert.equal(merged.completedDays['2026-11-03'],'5678abcd');
});
