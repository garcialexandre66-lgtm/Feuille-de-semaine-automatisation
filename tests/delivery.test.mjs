import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { deliveryInfo,saveDelivery,startGoogle,finishGoogle,scheduledDelivery,parisDate } from '../cloudflare/delivery.mjs';
import '../static/domain.js';
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const day=()=>[{client:'Atelier ASC',city:'',workplace:'atelier',travel:0,tpe:480,regie:0,chantier:0,sav:0}];
test('Friday schedule follows Paris time, including summer/winter and midnight',()=>{
 assert.equal(parisDate(new Date('2026-07-03T15:00:00Z')).time,'17:00');
 assert.equal(parisDate(new Date('2026-10-30T16:00:00Z')).time,'17:00');
 assert.deepEqual(parisDate(new Date('2026-07-02T22:15:00Z')),{date:'2026-07-03',day:5,time:'00:15'});
});
test('real D1: OAuth is bound to the browser/session; Friday uploads then sends only once',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-28',d1Databases:['DB']}));
 const original=globalThis.fetch;let sends=0,uploads=0,sendFailure=false;
 try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_initial.sql','0002_delivery.sql'])for(const sql of (await readFile('cloudflare/migrations/'+file,'utf8')).split(';').filter(x=>x.trim()))await db.prepare(sql).run();
  const env={DB:db,GOOGLE_CLIENT_ID:'test-id',GOOGLE_CLIENT_SECRET:'test-secret',APP_ORIGIN:'https://asc.test',ASSETS:{fetch:async request=>new Response(await readFile('cloudflare/assets/'+new URL(request.url).pathname.slice(1)))}};
  assert.equal((await deliveryInfo(env)).connected,false);
  await assert.rejects(saveDelivery(env,{to:'secretaire@example.com',copy:'moi@example.com',time:'17:00',enabled:true}),/Connectez/);
  await assert.rejects(saveDelivery(env,{to:'x\r\nBcc: x@example.com',copy:'moi@example.com',time:'17:00',enabled:false}),/adresses/);
  const session='ab'.repeat(32);await db.prepare('INSERT INTO sessions(token,expires) VALUES(?,?)').bind(await hash(session),Date.now()+600000).run();
  const start=await startGoogle(env,session),state=new URL(start.url).searchParams.get('state');
  assert.match(start.cookie,/HttpOnly/);assert.match(start.cookie,/SameSite=Lax/);
  assert.equal(new URL(start.url).searchParams.get('redirect_uri'),'https://asc.test/api/google/callback');
  await assert.rejects(finishGoogle(new Request('https://asc.test/api/google/callback?state='+state+'&code=test'),env),/interrompue/);
  globalThis.fetch=async(url,options={})=>{
   url=String(url);
   if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'access',refresh_token:'test-refresh',scope:'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file'});
   if(url.includes('/userinfo'))return Response.json({email:'moi@example.com'});
   if(url.includes('drive/v3/files?')&&options.method!=='POST')return Response.json({files:[]});
   if(url.includes('/upload/drive/')){uploads++;return Response.json({id:'pdf-id'});}
   if(url.includes('/drive/v3/files?')&&options.method==='POST')return Response.json({id:'folder-id'});
   if(url.endsWith('/messages/send')){sends++;if(sendFailure)throw Error('Lost response');const raw=JSON.parse(options.body).raw;const mime=Buffer.from(raw,'base64url').toString();assert.match(mime,/To: secretaire@example.com/);assert.match(mime,/Cc: moi@example.com/);assert.match(mime,/Semaine du 26-10-2026 au 30-10-2026.pdf/);return Response.json({id:'gmail-id'});}
   throw Error('Unexpected external call: '+url);
  };
  const request=new Request('https://asc.test/api/google/callback?state='+state+'&code=test',{headers:{Cookie:'asc_google_state='+state}});
  assert.equal((await finishGoogle(request,env)).status,303);
  await assert.rejects(finishGoogle(request,env),/Session expirée/);
  const settings=await db.prepare('SELECT * FROM delivery_settings WHERE id=1').first();assert.ok(!settings.refresh_token.includes('test-refresh'));
  assert.equal((await deliveryInfo(env)).connected,true);
  await saveDelivery(env,{to:'secretaire@example.com',copy:'moi@example.com',time:'17:00',enabled:true});
  const store=globalThis.Timesheet.extras({name:'Test',weeks:{'2026-10-26':Array.from({length:7},(_,i)=>i<5?day():[])}});
  await db.prepare('INSERT INTO account(id,salt,digest,payload) VALUES(1,?,?,?)').bind('test','test',JSON.stringify(store)).run();
  await scheduledDelivery(env,new Date('2026-10-30T15:45:00Z'));assert.equal(sends,0);
  await Promise.all([scheduledDelivery(env,new Date('2026-10-30T16:00:00Z')),scheduledDelivery(env,new Date('2026-10-30T16:00:00Z'))]);
  assert.equal(sends,1);assert.equal(uploads,1);assert.equal((await deliveryInfo(env)).last.status,'sent');
  await scheduledDelivery(env,new Date('2026-10-30T16:15:00Z'));assert.equal(sends,1);
  await db.prepare('DELETE FROM delivery_runs').run();store.weeks['2026-10-26'][5]=day();await db.prepare('UPDATE account SET payload=? WHERE id=1').bind(JSON.stringify(store)).run();
  await scheduledDelivery(env,new Date('2026-10-30T16:15:00Z'));assert.equal(sends,1);assert.equal((await deliveryInfo(env)).last.status,'blocked');
  store.weeks['2026-10-26'][5]=[];await db.prepare('UPDATE account SET payload=? WHERE id=1').bind(JSON.stringify(store)).run();sendFailure=true;
  await scheduledDelivery(env,new Date('2026-10-30T16:30:00Z'));assert.equal(sends,2);assert.equal((await deliveryInfo(env)).last.status,'error');
  await scheduledDelivery(env,new Date('2026-10-30T16:45:00Z'));assert.equal(sends,2);
 }finally{globalThis.fetch=original;await mf.dispose();}
});
