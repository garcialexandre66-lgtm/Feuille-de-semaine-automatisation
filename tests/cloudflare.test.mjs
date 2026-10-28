import { build } from 'esbuild';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { validateStore, derive } from '../cloudflare/worker.mjs';
const testSalt='01'.repeat(16);
const testKey=await derive('test-only-code',testSalt);
const verifier=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(testKey))),b=>b.toString(16).padStart(2,'0')).join('');
const setup=(setupToken)=>({setupToken,salt:testSalt,verifier});
const blank=()=>globalThis.Timesheet.extras({name:'Technicien',weeks:{}});
const entry=(overrides={})=>({client:'Atelier ASC',city:'',workplace:'atelier',travel:0,tpe:480,regie:0,chantier:0,sav:0,...overrides});
async function runtime(){
 const setupToken=crypto.randomUUID()+crypto.randomUUID();
 const bundled=await build({entryPoints:['cloudflare/worker.mjs'],bundle:true,format:'esm',write:false});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-28',d1Databases:['DB'],bindings:{SETUP_TOKEN:setupToken},serviceBindings:{ASSETS:()=>new Response('test')}}));
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

test('35 h hebdomadaires : une semaine de 39 h donne 4 h, sans double compte quotidien',()=>{
 const state=blank();const week=Array.from({length:7},()=>[]);
 for(let i=0;i<4;i++)week[i]=[entry()];week[4]=[entry({tpe:420})];state.weeks['2027-01-04']=week;
 assert.equal(globalThis.Timesheet.weekOvertime(week),240);
 const report=globalThis.Timesheet.monthSummary(state,'2027-01');assert.equal(report.worked,2340);assert.equal(report.overtime,240);assert.equal(report.lines.length,1);
 state.weeks['2026-12-28']=structuredClone(week);
 assert.equal(globalThis.Timesheet.monthSummary(state,'2026-12').overtime,0);
 assert.equal(globalThis.Timesheet.monthSummary(state,'2027-01').overtime,480);
});
test('statut envoyé invalidé par une correction, notes et favoris conservés',()=>{
 const s=blank();s.weeks['2027-01-04']=[[entry()],...Array.from({length:6},()=>[])];
 s.weekMeta['2027-01-04']={sentAt:new Date().toISOString(),signature:globalThis.Timesheet.signature(s.name,s.weeks['2027-01-04'])};
 assert.equal(globalThis.Timesheet.sentStatus(s,'2027-01-04'),'Envoyée');
 s.weeks['2027-01-04'][0][0].tpe=510;assert.equal(globalThis.Timesheet.sentStatus(s,'2027-01-04'),'À renvoyer');
 s.monthNotes['2027-01']='À vérifier avec la secrétaire';s.favorites.push({id:'favorite-1',client:'Client',city:'Perpignan',travel:30});validateStore(s);
 s.favorites[0].travel=-1;assert.throws(()=>validateStore(s));
});
test('fusion hors connexion : journées distinctes réunies, même journée en conflit',()=>{
 const base=blank();base.weeks['2027-01-04']=Array.from({length:7},()=>[]);
 const local=structuredClone(base),remote=structuredClone(base);local.weeks['2027-01-04'][0]=[entry()];remote.weeks['2027-01-04'][1]=[entry({tpe:510})];remote.monthNotes['2027-01']='Note de l’autre appareil';
 const merged=globalThis.Timesheet.merge(base,local,remote);assert.equal(merged.weeks['2027-01-04'][0][0].tpe,480);assert.equal(merged.weeks['2027-01-04'][1][0].tpe,510);assert.equal(merged.monthNotes['2027-01'],remote.monthNotes['2027-01']);
 remote.weeks['2027-01-04'][0]=[entry({tpe:540})];assert.equal(globalThis.Timesheet.merge(base,local,remote),null);
});

test('récupération : départ inconnu, semaines validées et débit de 8 h',()=>{
 const s=blank();s.recovery.startDate='2026-10-01';
 for(const key of ['2026-10-05','2026-10-12']){
  s.weeks[key]=Array.from({length:7},(_,i)=>i<4?[entry()]:i===4?[entry({tpe:420})]:[]);
  s.recovery.weeks[key]={source:'work',credit:240,signature:globalThis.Timesheet.signature('',s.weeks[key]),confirmedAt:'2026-10-20T12:00:00Z'};
 }
 s.weeks['2026-10-19']=[[entry({kind:'recovery',client:'Récupération',tpe:0})],...Array.from({length:6},()=>[])];
 let result=globalThis.Timesheet.recoverySummary(s,new Date('2026-10-28T12:00:00Z'));assert.equal(result.balance,null);assert.equal(result.earned,480);assert.equal(result.taken,480);assert.equal(result.change,0);
 s.recovery.openingMinutes=600;result=globalThis.Timesheet.recoverySummary(s,new Date('2026-10-28T12:00:00Z'));assert.equal(result.balance,600);
 s.weeks['2026-10-05'][0][0].tpe=500;result=globalThis.Timesheet.recoverySummary(s,new Date('2026-10-28T12:00:00Z'));assert.equal(result.earned,240);assert.equal(result.invalid,1);
});
test('école prévue sans crédit, école 39 h confirmée créditée une seule fois',()=>{
 const s=blank();s.recovery.startDate='2026-10-01';s.schoolDates['2026-10-05']=true;
 assert.equal(globalThis.Timesheet.recoverySummary(s).earned,0);
 s.weeks['2026-10-05']=Array.from({length:7},()=>[]);s.recovery.weeks['2026-10-05']={source:'school',credit:240,signature:globalThis.Timesheet.signature('',s.weeks['2026-10-05']),confirmedAt:'2026-10-10T12:00:00Z'};
 assert.equal(globalThis.Timesheet.recoverySummary(s).earned,240);assert.equal(globalThis.Timesheet.monthSummary(s,'2026-10').school,2340);assert.equal(globalThis.Timesheet.monthSummary(s,'2026-10').overtime,240);
 s.recovery.weeks['2026-10-05'].credit=240;assert.equal(globalThis.Timesheet.recoverySummary(s).earned,240);
});

test('mois de récupération rattaché au vendredi : pas au dimanche non travaillé',()=>{
 const s=blank();s.weeks['2026-10-26']=Array.from({length:7},(_,i)=>i<4?[entry()]:i===4?[entry({tpe:420})]:[]);
 assert.equal(globalThis.Timesheet.monthSummary(s,'2026-10').overtime,240);assert.equal(globalThis.Timesheet.monthSummary(s,'2026-11').overtime,0);
});
