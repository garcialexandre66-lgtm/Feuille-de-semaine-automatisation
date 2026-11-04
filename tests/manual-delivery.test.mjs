import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareDelivery,confirmDelivery,deliveryPreview} from '../cloudflare/delivery.mjs';
import '../static/domain.js';
const item=client=>({client,city:'',travel:0,tpe:480,regie:0,chantier:0,sav:0});
const payload=()=>({name:'Test manuel',week:'2030-01-07',days:Array.from({length:5},()=>[item('Chantier')])});
const encode=bytes=>Buffer.from(bytes).toString('base64');
async function setup(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-28',d1Databases:['DB']}));
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir('cloudflare/migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('cloudflare/migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 const env={DB:db,GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test-secret',APP_ORIGIN:'https://app.test',ASSETS:{fetch:async request=>new Response(await readFile('cloudflare/assets/'+new URL(request.url).pathname.slice(1)))}};
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.GOOGLE_CLIENT_SECRET)),{name:'AES-GCM'},false,['encrypt']);
 const sealed=encode(iv)+'.'+encode(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('test-refresh')));
 await db.prepare('UPDATE delivery_settings SET refresh_token=?,connected_email=? WHERE id=1').bind(sealed,'test@example.com').run();
 return {mf,env,db};
}
test('manual confirmation sends the exact reviewed attachment only once to Suzie, sharing the scheduled lock',async()=>{
 const {mf,env,db}=await setup(),original=globalThis.fetch;let sends=0,mime='',tokenFailure=false,sendFailure=false;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/token')){if(tokenFailure)return new Response('expired',{status:401});return Response.json({access_token:'test-access'});}
  assert.equal(String(url),'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  sends++;mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();
  if(sendFailure)throw Error('Lost network response');
  return Response.json({id:'sent-id'});
 };
 try{
  const data=payload(),preview=await prepareDelivery(env,data);assert.equal(sends,0);assert.equal(preview.to,'s.sanchez@asc66.fr');assert.equal(preview.connected,true);
  const expected=await deliveryPreview(env,preview.id);assert.equal(Buffer.from(expected.bytes).subarray(0,5).toString(),'%PDF-');
  const prepared=(await db.prepare('SELECT pdf FROM delivery_previews WHERE id=?').bind(preview.id).first()).pdf;
  data.days[0][0].client='Changed after preview';
  const results=await Promise.allSettled([confirmDelivery(env,preview.id),confirmDelivery(env,preview.id)]);
  assert.equal(sends,1);assert.ok(results.some(r=>r.status==='fulfilled'&&r.value.sent));
  assert.match(mime,/To: s.sanchez@asc66.fr\r\n/);assert.doesNotMatch(mime,/\r\nCc:/);assert.match(mime,/Content-Type: application\/pdf/);
  assert.ok(mime.includes(prepared.match(/.{1,76}/g).join('\r\n')),'the sent PDF is byte-for-byte the preview');
  await confirmDelivery(env,preview.id);assert.equal(sends,1);
  const same=await prepareDelivery(env,payload());assert.equal(same.alreadySent,true);await confirmDelivery(env,same.id);assert.equal(sends,1);
  assert.equal((await db.prepare('SELECT signature FROM delivery_runs').first()).signature,Timesheet.signature('Test manuel',[...payload().days,[],[]]));
  // A corrected version requires a new reviewed snapshot and explicit confirmation.
  const corrected=await prepareDelivery(env,data);assert.equal(corrected.alreadySent,false);await confirmDelivery(env,corrected.id);assert.equal(sends,2);
  // Expired or malformed tokens cannot send.
  const expired=await prepareDelivery(env,payload());await db.prepare('UPDATE delivery_previews SET expires=0 WHERE id=?').bind(expired.id).run();
  await assert.rejects(confirmDelivery(env,expired.id),/expiré/);await assert.rejects(confirmDelivery(env,'bad'),/invalide/);assert.equal(sends,2);
  // Failure before sending is safe to retry; failure after sending is never retried.
  await db.prepare('DELETE FROM delivery_runs').run();const fresh=await prepareDelivery(env,payload());tokenFailure=true;
  await assert.rejects(confirmDelivery(env,fresh.id),/Reconnectez/);assert.equal(sends,2);tokenFailure=false;sendFailure=true;
  await assert.rejects(confirmDelivery(env,fresh.id),/vérifier dans Gmail/);assert.equal(sends,3);
  await assert.rejects(confirmDelivery(env,fresh.id),/vérifier dans Gmail/);assert.equal(sends,3);
  const another=await prepareDelivery(env,payload());await assert.rejects(confirmDelivery(env,another.id),/vérifier dans Gmail/);assert.equal(sends,3);
 }finally{globalThis.fetch=original;await mf.dispose();}
});
test('manual API requires a session and explicit confirmation, validates the snapshot and protects its PDF',async()=>{
 const {build}=await import('esbuild'),bundled=await build({entryPoints:['cloudflare/worker.mjs'],bundle:true,format:'esm',write:false});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-28',d1Databases:['DB'],serviceBindings:{ASSETS:async request=>new Response(await readFile('cloudflare/assets/'+new URL(request.url).pathname.slice(1)))}}));
 try{
  const db=await mf.getD1Database('DB');for(const file of (await readdir('cloudflare/migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('cloudflare/migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  const session='ab'.repeat(32),hashed=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session))).toString('hex');
  await db.prepare('INSERT INTO sessions(token,expires) VALUES(?,?)').bind(hashed,Date.now()+60000).run();
  const post=(path,body,auth=true,extra={})=>mf.dispatchFetch('https://app.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Cookie:'asc_session='+session}:{}),...extra},body:JSON.stringify(body)});
  assert.equal((await post('/api/delivery/prepare',payload(),false)).status,401);
  assert.equal((await post('/api/delivery/confirm',{id:'ab'.repeat(32),confirm:true},false)).status,401);
  assert.equal((await post('/api/delivery/prepare',payload(),true,{Origin:'https://other.test'})).status,403);
  const bad=payload();bad.days[0][0].tpe=-1;assert.equal((await post('/api/delivery/prepare',bad)).status,400);
  assert.equal((await post('/api/delivery/prepare',{...payload(),week:'2030-01-08'})).status,400);
  const response=await post('/api/delivery/prepare',payload());assert.equal(response.status,200);const draft=await response.json();
  assert.equal(draft.configured,false);assert.equal(draft.to,'s.sanchez@asc66.fr');
  assert.equal((await mf.dispatchFetch('https://app.test/api/delivery/preview?id='+draft.id)).status,401);
  const preview=await mf.dispatchFetch('https://app.test/api/delivery/preview?id='+draft.id,{headers:{Cookie:'asc_session='+session}});
  assert.equal(preview.status,200);assert.equal(preview.headers.get('Cache-Control'),'no-store');assert.ok((await preview.text()).startsWith('%PDF-'));
  assert.equal((await post('/api/delivery/confirm',{id:draft.id,confirm:false})).status,400);
  assert.equal((await post('/api/delivery/confirm',{id:draft.id,confirm:true})).status,400);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM delivery_runs').first()).n,0);
 }finally{await mf.dispose();}
});
