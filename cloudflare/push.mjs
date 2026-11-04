import {buildPushPayload} from '@block65/webcrypto-web-push';
import {parisDate} from './delivery.mjs';
import '../static/domain.js';
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function endpoint(value){
 if(typeof value!=='string'||value.length>2048)throw Error('Abonnement de notification invalide.');
 const url=new URL(value),host=url.hostname;
 const allowed=['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].includes(host)||host.endsWith('.notify.windows.com');
 if(url.protocol!=='https:'||!allowed||url.username||url.password||url.hash||(url.port&&url.port!=='443'))throw Error('Service de notification non reconnu.');
 return value;
}
function key(value,length){
 if(typeof value!=='string'||value.length>100||! /^[A-Za-z0-9_-]+={0,2}$/.test(value))throw Error('Clé de notification invalide.');
 let raw;try{raw=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}catch{throw Error('Clé de notification invalide.');}
 if(raw.length!==length||(length===65&&raw[0]!==4))throw Error('Clé de notification invalide.');return value;
}
export async function pushKeys(env){
 let saved=await env.DB.prepare('SELECT public_key,private_key FROM push_keys WHERE id=1').first();
 if(!saved){
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub=b64(await crypto.subtle.exportKey('raw',pair.publicKey)),priv=await crypto.subtle.exportKey('jwk',pair.privateKey);
  await env.DB.prepare('INSERT OR IGNORE INTO push_keys(id,public_key,private_key) VALUES(1,?,?)').bind(pub,priv.d).run();
  saved=await env.DB.prepare('SELECT public_key,private_key FROM push_keys WHERE id=1').first();
 }
 return saved;
}
export async function pushInfo(env){return {publicKey:(await pushKeys(env)).public_key,time:'18:00',day:'vendredi',retryMinutes:10};}
export async function subscribePush(env,data){
 const sub=data.subscription;if(!sub||typeof sub!=='object')throw Error('Abonnement manquant.');
 const clean={endpoint:endpoint(sub.endpoint),expirationTime:null,keys:{p256dh:key(sub.keys?.p256dh,65),auth:key(sub.keys?.auth,16)}};
 await crypto.subtle.importKey('raw',Uint8Array.from(atob(clean.keys.p256dh.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)),{name:'ECDH',namedCurve:'P-256'},false,[]);
 const time=data.time||'18:00';if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Heure du rappel invalide.');
 const id=await digest(clean.endpoint),count=await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first();
 if(count.n>=10&&!await env.DB.prepare('SELECT id FROM push_subscriptions WHERE id=?').bind(id).first())throw Error('Dix appareils sont déjà inscrits. Désactivez un ancien appareil.');
 await env.DB.prepare('INSERT INTO push_subscriptions(id,subscription,reminder_time,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription,reminder_time=excluded.reminder_time').bind(id,JSON.stringify(clean),time,Date.now()).run();
 return {enabled:true,time};
}
export async function pushStatus(env,value){
 const row=await env.DB.prepare('SELECT reminder_time FROM push_subscriptions WHERE id=?').bind(await digest(endpoint(value))).first();return {enabled:!!row,time:row?.reminder_time||'18:00'};
}
export async function unsubscribePush(env,value){
 const id=await digest(endpoint(value));await env.DB.batch([env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(id),env.DB.prepare('DELETE FROM push_reminder_runs WHERE subscription_id=?').bind(id)]);return {enabled:false};
}
async function sent(env,week){
 const account=await env.DB.prepare('SELECT payload FROM account WHERE id=1').first();if(!account)return false;
 const store=JSON.parse(account.payload),days=store.weeks?.[week]||Array.from({length:7},()=>[]);
 if(globalThis.Timesheet.sentStatus(store,week)==='Envoyée')return true;
 const run=await env.DB.prepare("SELECT signature FROM delivery_runs WHERE week=? AND status='sent'").bind(week).first();
 return !!run&&run.signature===globalThis.Timesheet.signature(store.name,days);
}
export async function scheduledPush(env,now=new Date()){
 const local=parisDate(now);if(local.day!==5&&(local.day!==6||local.time>'00:59'))return;
 const date=new Date(local.date+'T12:00:00Z');if(local.day===6)date.setUTCDate(date.getUTCDate()-1);date.setUTCDate(date.getUTCDate()-4);const week=date.toISOString().slice(0,10);
 if(await sent(env,week))return;
 const subs=await env.DB.prepare('SELECT * FROM push_subscriptions ORDER BY created LIMIT 10').all();
 for(const row of subs.results){
  const first=await env.DB.prepare('SELECT status,sent_at FROM push_reminder_runs WHERE subscription_id=? AND week=? AND stage=1').bind(row.id,week).first();
  const minute=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5)),late=minute(local.time)-minute(row.reminder_time);
  let stage;if(!first&&local.day===5&&late>=0&&late<60)stage=1;
  else if(first?.status==='sent'&&now.getTime()-first.sent_at>=600000&&now.getTime()-first.sent_at<3600000)stage=2;
  else continue;
  if(await sent(env,week))return;
  const claimed=await env.DB.prepare("INSERT OR IGNORE INTO push_reminder_runs(subscription_id,week,stage,status,sent_at) VALUES(?,?,?,'sending',?)").bind(row.id,week,stage,now.getTime()).run();if(!claimed.meta.changes)continue;
  // Confirm the device remains subscribed after the claim, including a concurrent opt-out.
  if(!await env.DB.prepare('SELECT id FROM push_subscriptions WHERE id=?').bind(row.id).first()||await sent(env,week)){
   await env.DB.prepare("UPDATE push_reminder_runs SET status='cancelled' WHERE subscription_id=? AND week=? AND stage=?").bind(row.id,week,stage).run();continue;
  }
  try{
   const keys=await pushKeys(env),sub=JSON.parse(row.subscription);
   const request=await buildPushPayload({data:{title:'Feuille de semaine',body:'Pense à envoyer ta feuille de semaine',week,stage,url:'/?rappel='+week},options:{ttl:60,urgency:'normal',topic:'asc-feuille-'+week.replaceAll('-','')}},sub,{subject:env.APP_ORIGIN,publicKey:keys.public_key,privateKey:keys.private_key});
   const response=await fetch(sub.endpoint,{...request,redirect:'error'});
   if(response.status===404||response.status===410)await unsubscribePush(env,sub.endpoint);
   if(!response.ok)throw Error('Notification refusée.');
   await env.DB.prepare("UPDATE push_reminder_runs SET status='sent' WHERE subscription_id=? AND week=? AND stage=?").bind(row.id,week,stage).run();
  }catch{
   // An uncertain result is not retried; avoid multiple alerts for a single stage.
   await env.DB.prepare("UPDATE push_reminder_runs SET status='error' WHERE subscription_id=? AND week=? AND stage=?").bind(row.id,week,stage).run();
  }
 }
 await env.DB.prepare('DELETE FROM push_reminder_runs WHERE sent_at<?').bind(now.getTime()-90*86400000).run();
}
