import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PDFDocument } from 'pdf-lib';
import { createPdf, dailyOvertime } from '../cloudflare/export.mjs';
import '../static/review.js';

const entry=(overrides={})=>({client:'Client',city:'Perpignan',travel:0,tpe:480,regie:0,chantier:0,sav:0,...overrides});
const week=()=>({name:'Test PDF',week:'2026-10-05',days:Array.from({length:7},(_,i)=>i<5?[entry()]:[])});
test('H.SUP is daily: 8, 8, 8, 7, 6 h produces no daily overtime',()=>{
 const hours=[8,8,8,7,6];
 assert.deepEqual(hours.map(hours=>dailyOvertime([entry({tpe:hours*60})])[0]),[0,0,0,0,0]);
 assert.deepEqual(dailyOvertime([entry({tpe:540})]),[60]);
});
test('daily H.SUP splits across entries and starts again on the following day',()=>{
 assert.deepEqual(dailyOvertime([entry({tpe:480}),entry({tpe:30}),entry({tpe:30})]),[0,30,30]);
 assert.deepEqual(dailyOvertime([entry({tpe:60}),entry({tpe:420})]),[0,0]);
 assert.deepEqual(dailyOvertime([entry({tpe:540})]),[60]);
});
test('review: empty days, missing bons and long days; workshop and absences are exempt from bons',()=>{
 assert.equal(SheetReview.dayIssues([]).length,1);
 assert.match(SheetReview.dayIssues([entry()])[0],/numéro de bon/);
 assert.equal(SheetReview.dayIssues([entry({prep:'BP42'})]).length,0);
 assert.equal(SheetReview.dayIssues([entry({intervention:'BI42'})]).length,0);
 assert.equal(SheetReview.dayIssues([entry({workplace:'atelier'})]).length,0);
 assert.equal(SheetReview.dayIssues([entry({kind:'leave',tpe:0})]).length,0);
 assert.match(SheetReview.dayIssues([entry({workplace:'atelier',tpe:601})])[0],/10 h/);
});
const app=await readFile(new URL('../static/app.js',import.meta.url),'utf8');
const helpers=app.slice(app.indexOf('function preparePdf(){'),app.indexOf('async function weekBlob('));
function harness(data,accept=true){
 const status={textContent:''},messages=[];
 const context=vm.createContext({store:{name:data.name},week:data.week,days:()=>data.days,names:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],
  $:()=>status,confirm:message=>{messages.push(message);return accept;},sum:item=>['travel','tpe','regie','chantier','sav'].reduce((n,k)=>n+item[k],0),
  fmt:m=>`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`,iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
 vm.runInContext(helpers,context);return {context,messages,status,prepare:()=>vm.runInContext('preparePdf()',context)};
}
test('PDF: weekend entries require a decision; cancel preserves every entry',()=>{
 const data=week();data.days[5]=[entry({client:'Samedi',travel:30})];data.days[6]=[entry({client:'Dimanche'})];
 const before=JSON.stringify(data),h=harness(data,false);
 assert.equal(h.prepare(),null);assert.equal(JSON.stringify(data),before);
 assert.match(h.messages[0],/Samedi 10\/10\/2026/);assert.match(h.messages[0],/Dimanche 11\/10\/2026/);assert.match(h.messages[0],/trajet 30 min/);
});
test('PDF: accept excludes weekends and freezes the week and its data',()=>{
 const data=week();data.days[5]=[entry()];const h=harness(data),payload=h.prepare();
 assert.equal(payload.days.length,5);assert.equal(data.days[5].length,1);
 data.days[0][0].client='Changed';h.context.week='2026-06-15';
 assert.equal(payload.days[0][0].client,'Client');h.context.payload=payload;
 assert.equal(vm.runInContext('pdfFilename(payload)',h.context),'Semaine du 05-10-2026 au 09-10-2026.pdf');
});
test('PDF: ordinary weeks need no dialog; empty weeks do not export',()=>{
 const h=harness(week());assert.equal(h.prepare().days.length,5);assert.equal(h.messages.length,0);
 const data=week();data.days=Array.from({length:7},()=>[]);assert.equal(harness(data).prepare(),null);
});
test('PDF: filename follows selected week through month/year and DST changes',()=>{
 for(const [start,end] of [['2026-12-28','01-01-2027'],['2026-10-26','30-10-2026'],['2026-03-23','27-03-2026']]){
  const data=week();data.week=start;const h=harness(data);h.context.payload=h.prepare();
  assert.ok(vm.runInContext('pdfFilename(payload)',h.context).endsWith(`au ${end}.pdf`));
 }
});
test('PDF generator rejects weekends, invalid dates and overflowing days before reading assets',async()=>{
 const data=week();data.days[5]=[entry()];await assert.rejects(createPdf(data),/week-end/);
 data.days[5]=[];data.days[0]=Array.from({length:9},()=>entry());await assert.rejects(createPdf(data),/huit lignes/);
 for(const date of ['2026-10-06','2026-02-30','bad'])await assert.rejects(createPdf({...week(),week:date}),/semaine valide/);
});
test('PDF generation retains A4, dynamic metadata and five-day input',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async path=>new Response(await readFile(new URL('../cloudflare/assets/'+path.slice(1),import.meta.url)));
 try{
  const data=week();data.days=data.days.slice(0,5);data.days[4]=Array.from({length:8},()=>entry({tpe:60}));
  const pdf=await PDFDocument.load(await (await createPdf(data)).arrayBuffer());
  assert.equal(pdf.getPageCount(),1);assert.match(pdf.getTitle(),/05\/10\/2026/);assert.equal(pdf.getAuthor(),data.name);
  const size=pdf.getPage(0).getSize();assert.ok(Math.abs(size.width-595.3)<1);assert.ok(Math.abs(size.height-841.89)<1);
 }finally{globalThis.fetch=original;}
});
