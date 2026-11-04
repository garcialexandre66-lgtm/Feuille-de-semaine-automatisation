import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {pushKeys,pushInfo,subscribePush,pushStatus,unsubscribePush,scheduledPush} from '../cloudflare/push.mjs';
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-28',d1Databases:['DB']}));
 const db=await mf.getD1Database('DB');for(const file of (await readdir('cloudflare/migrations')).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile('cloudflare/migrations/'+file,'utf8')).split(';').filter(x=>x.trim()))await db.prepare(sql).run();
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const pub=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)),auth=crypto.getRandomValues(new Uint8Array(16));
 const sub={endpoint:'https://web.push.apple.com/test-subscription',keys:{p256dh:b64(pub),auth:b64(auth)}};
 const store=Timesheet.extras({name:'Test',weeks:{'2030-01-07':Array.from({length:7},()=>[])}});
 await db.prepare('INSERT INTO account(id,salt,digest,payload) VALUES(1,?,?,?)').bind('test','test',JSON.stringify(store)).run();
 return {mf,db,env:{DB:db,APP_ORIGIN:'https://asc.test'},sub,pair,pub,auth,store};
}
async function decrypt(body,pair,clientPub,auth){
 const raw=new Uint8Array(body),salt=raw.slice(0,16),length=raw[20],serverPub=raw.slice(21,21+length),encrypted=raw.slice(21+length);
 const server=await crypto.subtle.importKey('raw',serverPub,{name:'ECDH',namedCurve:'P-256'},false,[]),shared=await crypto.subtle.deriveBits({name:'ECDH',public:server},pair.privateKey,256);
 const hmac=async(key,message)=>new Uint8Array(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']),message));
 const join=(...parts)=>new Uint8Array(Buffer.concat(parts.map(x=>Buffer.from(x))));
 const prkKey=await hmac(auth,shared),ikm=await hmac(prkKey,join(new TextEncoder().encode('WebPush: info\0'),clientPub,serverPub,[1]));
 const prk=await hmac(salt,ikm),cek=(await hmac(prk,join(new TextEncoder().encode('Content-Encoding: aes128gcm\0'),[1]))).slice(0,16),nonce=(await hmac(prk,join(new TextEncoder().encode('Content-Encoding: nonce\0'),[1]))).slice(0,12);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),encrypted));
 let end=plain.length-1;while(plain[end]===0)end--;assert.equal(plain[end],2);return JSON.parse(new TextDecoder().decode(plain.slice(0,end)));
}
test('encrypted iPhone-compatible first reminder and one retry exactly ten minutes later; no duplicates',async()=>{
 const f=await fixture(),original=globalThis.fetch,sends=[];
 globalThis.fetch=async(url,request)=>{assert.equal(url,f.sub.endpoint);assert.equal(request.redirect,'error');assert.equal(request.headers['content-encoding'],'aes128gcm');assert.equal(request.headers.ttl,'60');
  const message=await decrypt(request.body,f.pair,f.pub,f.auth);assert.equal(message.body,'Pense à envoyer ta feuille de semaine');
  const match=request.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/);assert.ok(match);
  const [head,claims,signature]=match[1].split('.');assert.equal(JSON.parse(Buffer.from(claims,'base64url')).aud,'https://web.push.apple.com');
  const pub=await crypto.subtle.importKey('raw',Buffer.from(match[2],'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Buffer.from(signature,'base64url'),new TextEncoder().encode(head+'.'+claims)));
  sends.push(message);return new Response('',{status:201});};
 try{
  const keys=await Promise.all([pushKeys(f.env),pushKeys(f.env)]);assert.equal(keys[0].public_key,keys[1].public_key);assert.ok(!('private_key'in await pushInfo(f.env)));
  await subscribePush(f.env,{subscription:f.sub,time:'18:00'});assert.equal((await pushStatus(f.env,f.sub.endpoint)).enabled,true);
  const run=at=>scheduledPush(f.env,new Date(at));
  await run('2030-01-10T17:00:00Z');await run('2030-01-11T16:59:00Z');assert.equal(sends.length,0);
  await Promise.all([run('2030-01-11T17:00:00Z'),run('2030-01-11T17:00:00Z')]);assert.equal(sends.length,1);assert.equal(sends[0].stage,1);
  await run('2030-01-11T17:09:00Z');assert.equal(sends.length,1);
  await Promise.all([run('2030-01-11T17:10:00Z'),run('2030-01-11T17:10:00Z')]);assert.equal(sends.length,2);assert.equal(sends[1].stage,2);
  await run('2030-01-11T17:20:00Z');assert.equal(sends.length,2);
  await unsubscribePush(f.env,f.sub.endpoint);assert.equal((await pushStatus(f.env,f.sub.endpoint)).enabled,false);
 }finally{globalThis.fetch=original;await f.mf.dispose();}
});
test('actual sends or manual sent status cancel reminders; a changed sheet needs sending again',async()=>{
 const f=await fixture(),original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return new Response('',{status:201});};
 try{
  await subscribePush(f.env,{subscription:f.sub,time:'18:00'});
  const signature=Timesheet.signature(f.store.name,f.store.weeks['2030-01-07']);
  await f.db.prepare("INSERT INTO delivery_runs(week,signature,status,message,updated) VALUES(?,?,'sent','ok',?)").bind('2030-01-07',signature,Date.now()).run();
  await scheduledPush(f.env,new Date('2030-01-11T17:00:00Z'));assert.equal(sends,0);
  await f.db.prepare('DELETE FROM delivery_runs').run();
  await scheduledPush(f.env,new Date('2030-01-11T17:00:00Z'));assert.equal(sends,1);
  f.store.weekMeta['2030-01-07']={signature,sentAt:new Date().toISOString()};await f.db.prepare('UPDATE account SET payload=? WHERE id=1').bind(JSON.stringify(f.store)).run();
  await scheduledPush(f.env,new Date('2030-01-11T17:10:00Z'));assert.equal(sends,1);
  f.store.name='Test modifié';await f.db.prepare('UPDATE account SET payload=? WHERE id=1').bind(JSON.stringify(f.store)).run();
  await scheduledPush(f.env,new Date('2030-01-11T17:11:00Z'));assert.equal(sends,2);
 }finally{globalThis.fetch=original;await f.mf.dispose();}
});
test('summer time, late-night retry, expired devices, opt-out, and endpoint validation',async()=>{
 const f=await fixture(),original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return new Response('',{status:201});};
 try{
  await assert.rejects(subscribePush(f.env,{subscription:{...f.sub,endpoint:'https://127.0.0.1/private'}}),/non reconnu/);
  await assert.rejects(subscribePush(f.env,{subscription:{...f.sub,endpoint:'https://web.push.apple.com.attacker.test/a'}}),/non reconnu/);
  await assert.rejects(subscribePush(f.env,{subscription:f.sub,time:'25:00'}),/Heure/);
  await subscribePush(f.env,{subscription:f.sub,time:'18:00'});
  await scheduledPush(f.env,new Date('2030-07-05T15:59:00Z'));assert.equal(sends,0);
  await scheduledPush(f.env,new Date('2030-07-05T16:00:00Z'));assert.equal(sends,1);
  await unsubscribePush(f.env,f.sub.endpoint);await subscribePush(f.env,{subscription:f.sub,time:'23:59'});
  await scheduledPush(f.env,new Date('2030-01-11T22:59:00Z'));assert.equal(sends,2);
  await scheduledPush(f.env,new Date('2030-01-11T23:09:00Z'));assert.equal(sends,3);
  await unsubscribePush(f.env,f.sub.endpoint);globalThis.fetch=async()=>{sends++;return new Response('',{status:410});};await subscribePush(f.env,{subscription:f.sub,time:'18:00'});
  await scheduledPush(f.env,new Date('2030-01-11T17:00:00Z'));assert.equal(sends,4);assert.equal((await pushStatus(f.env,f.sub.endpoint)).enabled,false);
 }finally{globalThis.fetch=original;await f.mf.dispose();}
});
