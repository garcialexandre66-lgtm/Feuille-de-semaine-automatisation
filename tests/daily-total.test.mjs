import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPdf,dailySummary} from '../cloudflare/export.mjs';
const item=(client,tpe)=>({client,city:'',travel:0,tpe,regie:0,chantier:0,sav:0});
test('export totals separate ordinary hours from overtime and remain independent of entry order',()=>{
 const day=[item('Atelier ASC',10),item('Chantier',500)];
 assert.deepEqual(dailySummary(day),{minutes:480,overtime:30});
 assert.deepEqual(dailySummary([...day].reverse()),dailySummary(day));
 assert.deepEqual(dailySummary([item('Chantier',480)]),{minutes:480,overtime:0});
 assert.deepEqual(dailySummary([item('Chantier',540)]),{minutes:480,overtime:60});
 assert.deepEqual(dailySummary([]),{minutes:0,overtime:0});
 assert.deepEqual(dailySummary([item('École',420)]),{minutes:420,overtime:0});
});
test('PDF shows 8 h 00 in Total and 0 h 30 in H.SUP for an 8 h 30 day',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'asc-daily-total-'));
 try{
  const blob=await createPdf({name:'Test',week:'2030-01-07',days:[[item('Atelier ASC',10),item('Chantier',500)],[],[],[],[]]},async path=>new Uint8Array(await readFile(new URL('../cloudflare/assets/'+path.slice(1),import.meta.url))));
  const file=join(dir,'test.pdf');await writeFile(file,new Uint8Array(await blob.arrayBuffer()));
  const {stdout:bbox}=await promisify(execFile)('pdftotext',['-bbox',file,'-'],{encoding:'utf8'});
  const words=[...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]+)<\/word>/g)].map(m=>({x:+m[1],y:+m[2],text:m[3]}));
  const total=words.filter(w=>w.x>=361&&w.x<380&&w.y>=105&&w.y<130);
  const extra=words.filter(w=>w.x>=381&&w.x<400&&w.y>=105&&w.y<130);
  assert.deepEqual(total.map(w=>w.text),['8','h','00']);
  assert.deepEqual(extra.map(w=>w.text),['0','h','30']);
  assert.ok(total.every(w=>w.y<118));
 }finally{await rm(dir,{recursive:true,force:true});}
});
