import { createPdf } from './export.mjs';
import '../static/review.js';
const encoder=new TextEncoder();
const configured=env=>!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.APP_ORIGIN);
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(value);
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
const encode64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const decode64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const url64=value=>encode64(encoder.encode(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function tokenKey(env){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(env.GOOGLE_CLIENT_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(value,env){const iv=crypto.getRandomValues(new Uint8Array(12));return encode64(iv)+'.'+encode64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await tokenKey(env),encoder.encode(value))));}
async function unseal(value,env){const [iv,bytes]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(iv)},await tokenKey(env),decode64(bytes)));}
function callback(env){return new URL('/api/google/callback',env.APP_ORIGIN).href;}
async function googleToken(env,params){
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,...params})});
 if(!response.ok)throw Error('Connexion Google expirée ou refusée. Reconnectez Gmail et Drive dans les réglages.');
 return response.json();
}
async function google(access,path,options={}){
 const response=await fetch(path,{...options,headers:{Authorization:'Bearer '+access,...options.headers}});
 if(!response.ok)throw Error('Google n’a pas terminé l’opération ('+response.status+'). Vérifiez la connexion et les autorisations.');
 return response.json();
}
export async function deliveryInfo(env){
 const row=await env.DB.prepare('SELECT * FROM delivery_settings WHERE id=1').first();
 const last=await env.DB.prepare('SELECT week,status,message,drive_id,updated FROM delivery_runs ORDER BY updated DESC LIMIT 1').first();
 return {configured:configured(env),connected:!!row?.refresh_token,email:row?.connected_email||'',settings:{to:row?.to_address||'',copy:row?.copy_address||'',time:row?.send_time||'17:00',enabled:!!row?.enabled},last};
}
export async function saveDelivery(env,data){
 if(!email(data.to)||!email(data.copy)||!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(data.time)||typeof data.enabled!=='boolean')throw Error('Vérifiez les deux adresses et choisissez une heure par quart d’heure.');
 const row=await env.DB.prepare('SELECT refresh_token FROM delivery_settings WHERE id=1').first();
 if(data.enabled&&(!configured(env)||!row?.refresh_token))throw Error('Connectez Gmail et Drive avant d’activer l’envoi.');
 await env.DB.prepare('UPDATE delivery_settings SET to_address=?,copy_address=?,send_time=?,enabled=? WHERE id=1').bind(data.to,data.copy,data.time,Number(data.enabled)).run();
 return {message:data.enabled?'Envoi du vendredi activé, avec copie et classement dans Drive.':'Réglages enregistrés. Envoi automatique désactivé.'};
}
export async function startGoogle(env,sessionToken){
 if(!configured(env))throw Error('La connexion Google doit d’abord être configurée dans Cloudflare.');
 const state=hex(crypto.getRandomValues(new Uint8Array(32)));
 await env.DB.batch([env.DB.prepare('DELETE FROM google_states WHERE expires<?').bind(Date.now()),env.DB.prepare('INSERT INTO google_states(state,session_hash,expires) VALUES(?,?,?)').bind(state,await hash(sessionToken),Date.now()+600000)]);
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback(env),response_type:'code',scope:'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file',state,access_type:'offline',prompt:'consent',include_granted_scopes:'true'}).toString();
 return {url:url.href,cookie:`asc_google_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/google; Max-Age=600`};
}
export async function finishGoogle(request,env){
 const url=new URL(request.url),state=url.searchParams.get('state'),cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)asc_google_state=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!configured(env)||!state||state!==cookie)throw Error('Connexion Google interrompue. Recommencez depuis les réglages.');
 const row=await env.DB.prepare('DELETE FROM google_states WHERE state=? AND expires>? RETURNING session_hash').bind(state,Date.now()).first();
 if(!row||!await env.DB.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').bind(row.session_hash,Date.now()).first())throw Error('Session expirée. Reconnectez-vous à l’application.');
 if(url.searchParams.has('error')||!url.searchParams.get('code'))throw Error('Autorisation Google annulée.');
 const tokens=await googleToken(env,{code:url.searchParams.get('code'),redirect_uri:callback(env),grant_type:'authorization_code'});
 if(!tokens.refresh_token)throw Error('Google n’a pas fourni d’accès pour l’envoi du vendredi. Recommencez la connexion.');
 const scope=new Set((tokens.scope||'').split(' '));
 if(!scope.has('https://www.googleapis.com/auth/gmail.send')||!scope.has('https://www.googleapis.com/auth/drive.file'))throw Error('Autorisez l’envoi Gmail et le classement dans Drive.');
 const profile=await google(tokens.access_token,'https://openidconnect.googleapis.com/v1/userinfo');
 if(!email(profile.email))throw Error('Adresse du compte Google indisponible.');
 await env.DB.prepare('UPDATE delivery_settings SET refresh_token=?,connected_email=? WHERE id=1').bind(await seal(tokens.refresh_token,env),profile.email).run();
 return new Response(null,{status:303,headers:{Location:env.APP_ORIGIN+'/?google=connected','Set-Cookie':'asc_google_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/google; Max-Age=0','Cache-Control':'no-store'}});
}
export function parisDate(now){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const values=Object.fromEntries(parts.map(p=>[p.type,p.value])),date=`${values.year}-${values.month}-${values.day}`;
 return {date,day:new Date(date+'T12:00:00Z').getUTCDay(),time:values.hour+':'+values.minute};
}
async function folder(access,name,parent,role){
 const terms=["trashed=false","mimeType='application/vnd.google-apps.folder'",`appProperties has { key='ascRole' and value='${role}' }`,parent?`'${parent}' in parents`:"'root' in parents",`name='${name}'`];
 const found=await google(access,'https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q:terms.join(' and '),fields:'files(id)',pageSize:'10'}));
 if(found.files?.length)return found.files[0].id;
 const item=await google(access,'https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent||'root'],appProperties:{ascRole:role}})});return item.id;
}
async function archive(access,bytes,filename,week){
 const root=await folder(access,'Feuilles de semaine',null,'root'),parent=await folder(access,week.slice(0,7),root,'month');
 const boundary='asc_'+crypto.randomUUID();
 const metadata={name:filename,parents:[parent],appProperties:{ascWeek:week}};
 const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,bytes,`\r\n--${boundary}--`]);
 const result=await google(access,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});return result.id;
}
export async function scheduledDelivery(env,now=new Date()){
 const local=parisDate(now);if(local.day!==5||!configured(env))return;
 const config=await env.DB.prepare('SELECT * FROM delivery_settings WHERE id=1').first();
 if(!config?.enabled||!config.refresh_token||local.time<config.send_time)return;
 const date=new Date(local.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-4);const week=date.toISOString().slice(0,10);
 const account=await env.DB.prepare('SELECT payload FROM account WHERE id=1').first();if(!account)return;
 const store=JSON.parse(account.payload),days=store.weeks[week]||Array.from({length:7},()=>[]),signature=globalThis.Timesheet.signature(store.name,days);
 const issues=globalThis.SheetReview.weekIssues(days);if(!store.name.trim())issues.push({message:'Nom du technicien manquant'});
 if(issues.length){
  await env.DB.prepare("INSERT INTO delivery_runs(week,signature,status,message,updated) VALUES(?,?,'blocked',?,?) ON CONFLICT(week) DO UPDATE SET message=excluded.message,updated=excluded.updated WHERE delivery_runs.status='blocked'").bind(week,signature,'Envoi en attente : '+issues.map(i=>i.message).join(' ; '),Date.now()).run();return;
 }
 const lock=await env.DB.prepare("INSERT INTO delivery_runs(week,signature,status,message,updated) VALUES(?,?,'preparing','Préparation du PDF.',?) ON CONFLICT(week) DO UPDATE SET signature=excluded.signature,status='preparing',message=excluded.message,updated=excluded.updated WHERE delivery_runs.status='blocked'").bind(week,signature,Date.now()).run();
 if(!lock.meta.changes)return;
 let stage='preparing';
 try{
  const tokens=await googleToken(env,{grant_type:'refresh_token',refresh_token:await unseal(config.refresh_token,env)});
  const payload={name:store.name,week,days:days.slice(0,5)};
  const pdf=await createPdf(payload,async path=>{const response=await env.ASSETS.fetch(new Request(new URL(path,env.APP_ORIGIN)));if(!response.ok)throw Error('Modèle du PDF indisponible.');return new Uint8Array(await response.arrayBuffer());});
  const bytes=new Uint8Array(await pdf.arrayBuffer()),friday=local.date;
  const fr=value=>value.split('-').reverse().join('-'),filename=`Semaine du ${fr(week)} au ${fr(friday)}.pdf`;
  const drive=await archive(tokens.access_token,bytes,filename,week);
  stage='sending';await env.DB.prepare("UPDATE delivery_runs SET status='sending',message='PDF classé dans Drive. Envoi en cours.',drive_id=?,updated=? WHERE week=?").bind(drive,Date.now(),week).run();
  const boundary='asc_'+crypto.randomUUID(),subject=`Feuille de semaine du ${fr(week)} au ${fr(friday)}`;
  const mime=[`From: ${config.connected_email}`,`To: ${config.to_address}`,`Cc: ${config.copy_address}`,`Subject: =?UTF-8?B?${encode64(encoder.encode(subject))}?=`,`Message-ID: <asc-${week}@${new URL(env.APP_ORIGIN).hostname}>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encode64(encoder.encode(`Bonjour,\n\nVeuillez trouver ma feuille de semaine en pièce jointe.\n\n${store.name}`)),`--${boundary}`,'Content-Type: application/pdf',`Content-Disposition: attachment; filename="${filename}"`,'Content-Transfer-Encoding: base64','',encode64(bytes).match(/.{1,76}/g).join('\r\n'),`--${boundary}--`].join('\r\n');
  const sent=await google(tokens.access_token,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:url64(mime)})});
  await env.DB.prepare("UPDATE delivery_runs SET status='sent',message='PDF envoyé avec copie et classé dans Drive.',gmail_id=?,updated=? WHERE week=?").bind(sent.id,Date.now(),week).run();
 }catch(error){
  const message=stage==='sending'?'Envoi à vérifier dans Gmail avant toute nouvelle tentative. Le PDF a été classé dans Drive.':error.message;
  await env.DB.prepare("UPDATE delivery_runs SET status='error',message=?,updated=? WHERE week=?").bind(message,Date.now(),week).run();
 }
}
