import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const context=vm.createContext({});vm.runInContext(fs.readFileSync('static/school-plan.js','utf8'),context);
const reconcile=(...args)=>JSON.parse(JSON.stringify(context.reconcileSchoolPlan(...args)));
const school={client:'École',city:'',workplace:'school',travel:0,tpe:420,regie:0,chantier:0,sav:0,prep:'',intervention:''};
test('exact calendar removes stale automatic days, preserves work and is idempotent',()=>{
 const days=[[],[school],[{...school,tpe:360}],[],[],[],[]];
 const input={schoolDates:{'2030-01-08':true,'2030-01-09':true,'2029-12-31':true},weeks:{'2030-01-07':days},dayTasks:{'2030-01-08':{a:'Ranger'}}};
 const result=reconcile(input,['2030-01-10'],'2030-01-01','2030-12-31');
 assert.equal(result.removed,1);assert.equal(result.filled,1);
 assert.equal(result.store.weeks['2030-01-07'][1].length,0);
 assert.equal(result.store.weeks['2030-01-07'][2][0].tpe,360);
 assert.equal(result.store.weeks['2030-01-07'][3][0].tpe,420);
 assert.equal(result.store.schoolDates['2029-12-31'],true);
 assert.deepEqual(result.store.dayTasks,input.dayTasks);assert.equal(input.weeks['2030-01-07'][1].length,1);
 assert.deepEqual(reconcile(result.store,['2030-01-10'],'2030-01-01','2030-12-31').store,result.store);
});
test('invalid dates or ranges do not modify the source',()=>{
 const input={weeks:{},schoolDates:{}};
 assert.throws(()=>reconcile(input,['2030-02-30'],'2030-01-01','2030-12-31'));
 assert.throws(()=>reconcile(input,['2031-01-01'],'2030-01-01','2030-12-31'));
 assert.deepEqual(input,{weeks:{},schoolDates:{}});
});
test('existing job and school rows with notes are preserved',()=>{
 const day=[{...school,intervention:'Cours pratique'},{...school,client:'Client chantier',workplace:'site'}];
 const result=reconcile({schoolDates:{'2030-01-08':true},weeks:{'2030-01-07':[[],day,[],[],[],[],[]]}},['2030-01-09'],'2030-01-01','2030-12-31');
 assert.deepEqual(result.store.weeks['2030-01-07'][1],day);
});
