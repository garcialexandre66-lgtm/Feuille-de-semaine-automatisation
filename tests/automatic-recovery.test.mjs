import test from 'node:test';
import assert from 'node:assert/strict';
import '../static/domain.js';
const entry=tpe=>({client:'Atelier ASC',city:'',workplace:'atelier',travel:0,tpe,regie:0,chantier:0,sav:0});
const days=()=>Array.from({length:7},(_,i)=>i<4?[entry(480)]:i===4?[entry(420)]:[]);
const state=()=>{const s=Timesheet.extras({name:'Test',weeks:{'2026-10-05':days()}});s.recovery.startDate='2026-10-01';return s;};
const now=new Date('2026-10-30T12:00:00Z');
test('35 h: 39 h gives 4 h automatically without validation or an invented opening balance',()=>{
 const s=state(),report=Timesheet.estimatedRecovery(s,now);
 assert.equal(report.earned,240);assert.equal(report.change,240);assert.equal(report.balance,null);assert.equal(report.known,false);
 assert.equal(Timesheet.estimatedRecovery(s,now).earned,240);
 s.weeks['2026-10-05'][4][0].tpe=480;assert.equal(Timesheet.estimatedRecovery(s,now).earned,300);
});
test('past RTT subtracts 8 h; future RTT is reserved without subtracting twice',()=>{
 const s=state();s.recovery.openingMinutes=600;
 const rtt=()=>[{...entry(0),kind:'recovery',client:'Récupération'}];
 s.weeks['2026-10-19']=Array.from({length:7},(_,i)=>i===0?rtt():[]);
 s.weeks['2026-11-02']=Array.from({length:7},(_,i)=>i===0?rtt():[]);
 const report=Timesheet.estimatedRecovery(s,now);assert.equal(report.taken,480);assert.equal(report.planned,480);assert.equal(report.balance,360);assert.equal(report.available,-120);
});
test('future hours are excluded, including future days of the current week',()=>{
 const s=state();s.weeks['2026-11-02']=days();assert.equal(Timesheet.estimatedRecovery(s,now).earned,240);
 s.weeks['2026-10-26']=days();const thursday=Timesheet.estimatedRecovery(s,new Date('2026-10-29T12:00:00Z'));assert.equal(thursday.earned,240);
 assert.equal(Timesheet.estimatedRecovery(s,now).earned,480);
});
test('a confirmed amount replaces its automatic estimate; corrections recalculate without duplicates',()=>{
 const s=state(),week='2026-10-05';s.recovery.weeks[week]={credit:180,source:'work',signature:Timesheet.signature('',s.weeks[week]),confirmedAt:now.toISOString()};
 assert.equal(Timesheet.estimatedRecovery(s,now).earned,180);
 s.weeks[week][4][0].tpe=480;assert.equal(Timesheet.estimatedRecovery(s,now).earned,300);
});
test('school planning creates no hours; a confirmed school credit is included only once',()=>{
 const s=state();s.schoolDates['2026-10-12']=true;assert.equal(Timesheet.estimatedRecovery(s,now).earned,240);
 const week='2026-10-12';s.weeks[week]=days();s.recovery.weeks[week]={credit:240,source:'school',signature:Timesheet.signature('',s.weeks[week]),confirmedAt:now.toISOString()};
 assert.equal(Timesheet.estimatedRecovery(s,now).earned,480);
});
test('tracking start and Paris calendar date are respected',()=>{
 const s=state();s.recovery.startDate='2026-10-10';assert.equal(Timesheet.estimatedRecovery(s,now).earned,0);
 s.recovery.startDate='2026-10-01';s.weeks['2026-10-05'][6]=[entry(60)];
 assert.equal(Timesheet.estimatedRecovery(s,new Date('2026-10-10T22:30:00Z')).earned,300);
});
