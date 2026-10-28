import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { validateStore, derive } from '../cloudflare/worker.mjs';
const testSalt='01'.repeat(16);
const testKey=await derive('test-only-code',testSalt);
const verifier=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(testKey))),b=>b.toString(16).padStart(2,'0')).join('');
const setup=(setupToken)=>({setupToken,salt:testSalt,verifier});
const blank=()=>({name:'Technicien',weeks:{}});
const entry=(overrides={})=>({client:'Atelier ASC',city:'',workplace:'atelier',travel:0,tpe:480,regie:0,chantier:0,sav:0,...overrides});
async function runtime(){
 const setupToken=crypto.randomUUID()+crypto.randomUUID();
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'cloudflare/worker.mjs',compatibilityDate:'2026-10-28',d1Databases:['DB'],bindings:{SETUP_TOKEN:setupToken},serviceBindings:{ASSETS:()=>new Response('test')}}));
 const db=await mf.getD1Database('DB');
 const migration=await readFile('cloudflare/migrations/0001_initial.sql','utf8');
 for(const sql of migration.split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 const request=async(path,data,cookie,extra={})=>mf.dispatchFetch('https://asc.test'+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});
 return {mf,request,setupToken};
}
test('validation des semaines, des durées et des absences',()=>{
 const state=blank();state.weeks['2027-01-04']=[[entry()],...Array.from({length:6},()=>[])];
 assert.equal(validateStore(state),state);
 const invalid=structuredClone(state);invalid.weeks['2027-01-04'][0][0].tpe=-1;assert.throws(()=>validateStore(invalid));
 const sick=structuredClone(state);sick.weeks['2027-01-04'][0]=[entry({kind:'sick',client:'Arrêt maladie',tpe:0})];validateStore(sick);
 sick.weeks['2027-01-04'][0][0].tpe=480;assert.throws(()=>validateStore(sick));
 const tuesday={name:'Test',weeks:{'2027-01-05':state.weeks['2027-01-04']}};assert.throws(()=>validateStore(tuesday));
});
test('dérivé du code salé et déterministe',async()=>{
 const salt='01'.repeat(16);assert.equal(await derive('test-only-code',salt),await derive('test-only-code',salt));
 assert.notEqual(await derive('test-only-code',salt),await derive('test-only-code','02'.repeat(16)));
});
test('D1 réel : installation, connexion, sauvegarde, conflit et verrouillage',async()=>{
 const {mf,request,setupToken}=await runtime();
 try{
  assert.equal((await request('/api/state')).status,401);
  assert.equal((await (await request('/api/session')).json()).configured,false);
  assert.equal((await request('/api/setup',setup('incorrect'))).status,403);
  assert.equal((await request('/api/setup',setup(setupToken))).status,200);
  assert.equal((await request('/api/setup',setup(setupToken))).status,409);
  assert.equal((await request('/api/login',{key:'00'.repeat(32)})).status,401);
  const login=await request('/api/login',{key:testKey});assert.equal(login.status,200);
  const header=login.headers.get('Set-Cookie');assert.match(header,/HttpOnly/);assert.match(header,/Secure/);assert.match(header,/SameSite=Strict/);
  const cookie=header.split(';')[0];
  const state=blank();state.weeks['2027-01-04']=[[entry()],...Array.from({length:6},()=>[])];
  assert.equal((await request('/api/state',{store:state,revision:0},cookie)).status,200);
  assert.equal((await request('/api/state',{store:blank(),revision:0},cookie)).status,409);
  assert.deepEqual((await (await request('/api/state',undefined,cookie)).json()).store,state);
  assert.equal((await request('/api/state',{store:blank(),revision:1},cookie,{Origin:'https://other.test'})).status,403);
  assert.equal((await request('/api/logout',{},cookie)).status,200);
  assert.equal((await request('/api/state',undefined,cookie)).status,401);
 }finally{await mf.dispose();}
});
test('limite de tentatives de connexion',async()=>{
 const {mf,request,setupToken}=await runtime();
 try{
  await request('/api/setup',setup(setupToken));
  for(let n=0;n<10;n++)assert.equal((await request('/api/login',{key:'00'.repeat(32)})).status,401);
  assert.equal((await request('/api/login',{key:testKey})).status,429);
 }finally{await mf.dispose();}
});
