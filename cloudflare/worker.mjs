const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));
const hash=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
export async function derive(code,salt){
 const key=await crypto.subtle.importKey('raw',encoder.encode(code),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:100000,hash:'SHA-256'},key,256));
}
function same(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const newToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const headers={
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'same-origin',
 'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
function json(status,data,cookie){const h={...headers,'Content-Type':'application/json; charset=utf-8'};if(cookie)h['Set-Cookie']=cookie;return new Response(JSON.stringify(data),{status,headers:h});}
const token=request=>request.headers.get('Cookie')?.match(/(?:^|;\s*)asc_session=([a-f0-9]{64})(?:;|$)/)?.[1]||'';
async function authenticated(request,env){const value=token(request);return value?!!await env.DB.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').bind(await hash(value),Date.now()).first():false;}
const validHex=(value,length)=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${length}}$`).test(value);
export function validateStore(store){
 if(!store||typeof store.name!=='string'||store.name.length>100||!store.weeks||typeof store.weeks!=='object'||Array.isArray(store.weeks)||Object.keys(store.weeks).length>1000)throw Error('Sauvegarde invalide.');
 for(const [week,days] of Object.entries(store.weeks)){
  const date=new Date(week+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==week||date.getUTCDay()!==1||!Array.isArray(days)||days.length!==7)throw Error('Semaine invalide.');
  for(const day of days){
   if(!Array.isArray(day)||day.length>8)throw Error('Huit lignes maximum par journée.');
   let total=0;
   for(const item of day){
    if(!item||typeof item.client!=='string'||typeof item.city!=='string'||item.client.length>200||item.city.length>200)throw Error('Client ou localité invalide.');
    for(const key of ['travel','tpe','regie','chantier','sav']){if(!Number.isInteger(item[key])||item[key]<0||item[key]>1440)throw Error('Durée invalide.');total+=item[key];}
   }
   if(total>1440)throw Error('Une journée ne peut pas dépasser 24 heures.');
   if(day.some(i=>['leave','sick'].includes(i.kind))&&(day.length!==1||total!==0||day[0].client!=={leave:'Congé',sick:'Arrêt maladie'}[day[0].kind]))throw Error('Une absence doit être seule et sans heures travaillées.');
  }
 }
 if(encoder.encode(JSON.stringify(store)).length>1500000)throw Error('Archive trop volumineuse. Téléchargez une sauvegarde et contactez le responsable de l’application.');
 return store;
}
async function body(request){
 if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('Format JSON requis.');
 const reader=request.body?.getReader();if(!reader)throw Error('Demande vide.');let length=0,parts=[];
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>2000000){await reader.cancel();throw Error('Demande trop volumineuse.');}parts.push(value);}
 const buffer=new Uint8Array(length);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder().decode(buffer));
}
async function api(request,env,url){
 const path=url.pathname;
 if(!env.DB)return json(503,{error:'La base D1 doit être reliée à l’application.'});
 if(request.method==='GET'&&path==='/api/session'){const account=await env.DB.prepare('SELECT salt FROM account WHERE id=1').first();return json(200,{deployment:'cloudflare',configured:!!account,salt:account?.salt,authenticated:await authenticated(request,env)});}
 if(request.method==='GET'&&path==='/api/state'){
  if(!await authenticated(request,env))return json(401,{error:'Connectez-vous pour retrouver vos semaines.'});
  const row=await env.DB.prepare('SELECT payload,revision FROM account WHERE id=1').first();return json(200,{store:JSON.parse(row.payload),revision:row.revision});
 }
 if(request.method!=='POST')return json(404,{error:'Page inconnue.'});
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin))return json(403,{error:'Origine non autorisée.'});
 let data;try{data=await body(request);}catch{return json(400,{error:'Demande JSON invalide ou trop volumineuse.'});}
 if(path==='/api/setup'){
  if(await env.DB.prepare('SELECT id FROM account WHERE id=1').first())return json(409,{error:'Le code personnel est déjà créé.'});
  if(!env.SETUP_TOKEN||env.SETUP_TOKEN.length<16)return json(503,{error:'Ajoutez le secret SETUP_TOKEN (16 caractères minimum) dans les paramètres Cloudflare.'});
  if(typeof data.setupToken!=='string'||!same(await hash(data.setupToken),await hash(env.SETUP_TOKEN)))return json(403,{error:'Clé d’installation incorrecte.'});
  if(!validHex(data.salt,32)||!validHex(data.verifier,64))return json(400,{error:'Configuration du code invalide.'});
  const salt=data.salt,digest=data.verifier;
  const result=await env.DB.prepare('INSERT OR IGNORE INTO account(id,salt,digest) VALUES(1,?,?)').bind(salt,digest).run();
  return result.meta.changes?json(200,{ok:true}):json(409,{error:'Un code a déjà été créé.'});
 }
 if(path==='/api/login'){
  const account=await env.DB.prepare('SELECT salt,digest FROM account WHERE id=1').first();
  if(!account)return json(503,{error:'Créez d’abord votre code personnel.'});
  const now=Date.now(),address=await hash(request.headers.get('CF-Connecting-IP')||'local');
  const attempt=await env.DB.prepare('INSERT INTO attempts(address,count,until) VALUES(?,1,?) ON CONFLICT(address) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN excluded.until ELSE until END RETURNING count').bind(address,now+900000,now,now).first();
  if(attempt.count>10)return json(429,{error:'Trop de tentatives. Réessayez dans 15 minutes.'});
  const valid=validHex(data.key,64),digest=await hash(valid?data.key:'');
  if(!valid||!same(digest,account.digest))return json(401,{error:'Code incorrect.'});
  const session=newToken();
  await env.DB.batch([
   env.DB.prepare('DELETE FROM attempts WHERE address=? OR until<?').bind(address,now),
   env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
   env.DB.prepare('INSERT INTO sessions(token,expires) VALUES(?,?)').bind(await hash(session),now+86400000)
  ]);
  return json(200,{ok:true},`asc_session=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
 }
 if(!await authenticated(request,env))return json(401,{error:'Connectez-vous pour continuer.'});
 if(path==='/api/logout'){
  await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await hash(token(request))).run();
  return json(200,{ok:true},'asc_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
 }
 if(path==='/api/state'){
  try{validateStore(data.store);if(!Number.isInteger(data.revision)||data.revision<0)throw Error('Révision invalide.');}
  catch(error){return json(400,{error:error.message});}
  const row=await env.DB.prepare('UPDATE account SET payload=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(data.store),data.revision).first();
  return row?json(200,{revision:row.revision}):json(409,{error:'Vos semaines ont été modifiées sur un autre appareil.'});
 }
 return json(404,{error:'Page inconnue.'});
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 try{
  if(url.pathname.startsWith('/api/'))return await api(request,env,url);
  if(url.pathname.startsWith('/export'))return json(400,{error:'Utilisez les boutons de l’application pour générer le PDF ou l’ODS sur votre appareil.'});
  const response=await env.ASSETS.fetch(request);
  const result=new Response(response.body,response);for(const [key,value] of Object.entries(headers))if(key!=='Cache-Control')result.headers.set(key,value);return result;
 }catch{return json(503,{error:'Service temporairement indisponible. Vérifiez la base D1 et sa migration dans Cloudflare.'});}
}};
