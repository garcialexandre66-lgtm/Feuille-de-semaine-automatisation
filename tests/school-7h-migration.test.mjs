import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {validateStore} from '../cloudflare/worker.mjs';
test('real D1: school planning becomes seven-hour school entries without overwriting existing work',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-28',d1Databases:['DB']}));
 try{
  const db=await mf.getD1Database('DB');for(const sql of (await readFile('cloudflare/migrations/0001_initial.sql','utf8')).split(';').filter(x=>x.trim()))await db.prepare(sql).run();
  const existing={client:'Client à conserver',city:'Canet',travel:60,tpe:0,regie:0,chantier:420,sav:0};
  const store={name:'Test',weeks:{'2026-11-02':Array.from({length:7},(_,i)=>i===0?[existing]:[])},schoolDates:{'2026-11-02':true,'2026-11-04':true,'2026-11-06':true,'2027-01-05':true},learningNotes:{'2026-11-02':'Note conservée'},dayTasks:{'2026-11-02':{tools:{text:'Outils',done:true}}}};
  await db.prepare('INSERT INTO account(id,salt,digest,payload) VALUES(1,?,?,?)').bind('test','test',JSON.stringify(store)).run();
  const migration=await readFile('cloudflare/migrations/0003_school_days_7h.sql','utf8');await db.prepare(migration).run();
  const row=await db.prepare('SELECT payload,revision FROM account WHERE id=1').first(),updated=JSON.parse(row.payload);validateStore(updated);
  assert.deepEqual(updated.weeks['2026-11-02'][0],[existing]);assert.equal(updated.weeks['2026-11-02'][2][0].client,'École');assert.equal(updated.weeks['2026-11-02'][2][0].tpe,420);assert.equal(updated.weeks['2026-11-02'][4][0].tpe,420);assert.equal(updated.weeks['2027-01-04'][1][0].tpe,420);assert.equal(updated.weeks['2027-01-04'][1][0].workplace,'school');assert.deepEqual(updated.learningNotes,store.learningNotes);assert.deepEqual(updated.dayTasks,store.dayTasks);assert.equal(row.revision,1);
  await db.prepare(migration).run();assert.equal(JSON.parse((await db.prepare('SELECT payload FROM account WHERE id=1').first()).payload).weeks['2026-11-02'][2].length,1);
 }finally{await mf.dispose();}
});
