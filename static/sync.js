'use strict';
let connected=false,revision=0,dirty=false,generation=0,pending=null,busy=false,conflicting=false,cacheSaved=false;
let baseStore=Timesheet.extras({name:'',weeks:{}});
const legacy=JSON.parse(JSON.stringify(store));store=Timesheet.extras({name:'',weeks:{}});
const copy=value=>JSON.parse(JSON.stringify(value));
function syncMessage(text,error=false){$('sync-status').textContent=text;$('sync-status').toggleAttribute('data-error',error);}
async function api(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const data=await response.json();if(!response.ok){const error=Error(data.error||'Connexion impossible.');error.status=response.status;throw error;}return data;
}
function snapshot(){return {store,base:baseStore,revision,dirty,deployment:window.ASC_CLOUDFLARE?'cloudflare':'python'};}
async function persist(){const gen=generation;try{await OfflineStore.persist(snapshot());if(generation===gen)cacheSaved=true;$('offline-help').textContent='Vos données sont chiffrées sur cet appareil. Le code personnel permet aussi de les ouvrir sans réseau.';return true;}catch{cacheSaved=false;$('offline-help').textContent='La sauvegarde locale est indisponible. Téléchargez une sauvegarde avant de quitter.';return false;}}
function adoptCached(saved){
 if(!saved||!Number.isInteger(saved.revision)||saved.revision<0)throw Error('Sauvegarde locale invalide.');
 store=checkStore(saved.store);baseStore=checkStore(saved.base||copy(saved.store));revision=saved.revision;dirty=!!saved.dirty;window.ASC_CLOUDFLARE=saved.deployment==='cloudflare';cacheSaved=true;
}
function showLogin(message=''){
 connected=false;$('application').hidden=true;$('login-panel').hidden=false;$('login-error').textContent=message;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();$('access-code').value='';$('access-code').focus();
}
function showApp(){
 $('application').hidden=false;$('login-panel').hidden=true;$('access-code').value='';
 $('migrate-local').hidden=!Object.keys(legacy.weeks).some(k=>legacy.weeks[k].some(day=>day.length));render();
}
async function syncSave(){
 dirty=true;generation++;cacheSaved=false;$('status').textContent='Enregistrement…';clearTimeout(pending);
 const saved=await persist();$('status').textContent=saved?'Enregistré sur cet appareil.':'Sauvegarde locale impossible : gardez cette page ouverte et téléchargez une sauvegarde.';
 syncMessage(navigator.onLine?'Synchronisation en cours…':saved?'Hors connexion · enregistré sur cet appareil':'Hors connexion · sauvegarde à télécharger',!navigator.onLine&&!saved);
 if(connected)pending=setTimeout(push,600);
}
function showConflict(){conflicting=true;$('conflict').hidden=false;syncMessage('Deux versions à vérifier.',true);}
async function reconcile(){
 const remote=await api('/api/state');
 const merged=Timesheet.merge(baseStore,store,checkStore(remote.store));
 if(!merged){showConflict();return false;}
 store=checkStore(merged);baseStore=checkStore(remote.store);revision=remote.revision;generation++;await persist();render();return true;
}
async function push(){
 if(!connected||busy||conflicting)return false;if(!dirty){syncMessage('✓ Semaines synchronisées');return true;}
 busy=true;const sent=generation,submitted=copy(store);
 try{const result=await api('/api/state',{revision,store:submitted});revision=result.revision;baseStore=submitted;if(generation===sent)dirty=false;await persist();syncMessage(dirty?'Synchronisation en cours…':'✓ Semaines synchronisées');return !dirty;}
 catch(error){
  if(error.status===409){try{await reconcile();}catch{syncMessage('Synchronisation interrompue. Vos données locales sont conservées.',true);}}
  else if(error.status===401){await persist();showLogin('Reconnectez-vous pour synchroniser vos modifications. Elles sont conservées sur cet appareil.');}
  else syncMessage(cacheSaved?'Hors connexion · enregistré sur cet appareil':'Non synchronisé : téléchargez une sauvegarde.',!cacheSaved);
  return false;
 }finally{busy=false;if(dirty&&generation!==sent&&!conflicting&&connected)pending=setTimeout(push,300);}
}
async function pull(){
 if(!connected||busy||document.querySelector('dialog[open]')||document.activeElement?.matches('input,textarea,select'))return;
 if(dirty){await push();return;}busy=true;const before=generation;
 try{const result=await api('/api/state');if(generation!==before||dirty)return;if(result.revision!==revision){store=checkStore(result.store);baseStore=copy(store);revision=result.revision;await persist();render();}syncMessage('✓ Semaines synchronisées');}
 catch(error){if(error.status===401)showLogin('Reconnectez-vous pour synchroniser. Vos données locales restent disponibles.');else syncMessage('Hors connexion · données conservées sur cet appareil');}finally{busy=false;}
}
async function prepareShell(){
 if(!window.ASC_CLOUDFLARE||!('serviceWorker' in navigator))return;
 try{await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;$('offline-help').textContent='Le mode hors connexion est prêt après téléchargement des fichiers. Vos données sont chiffrées sur cet appareil.';}
 catch{$('offline-help').textContent='Les fichiers hors connexion ne sont pas encore prêts. Gardez Internet pour rouvrir l’application.';}
}
async function openAccount(){
 const result=await api('/api/state');
 if(!dirty){store=checkStore(result.store);baseStore=copy(store);revision=result.revision;}
 else if(result.revision!==revision){const merged=Timesheet.merge(baseStore,store,checkStore(result.store));if(merged){store=checkStore(merged);baseStore=checkStore(result.store);revision=result.revision;generation++;}else showConflict();}
 connected=true;await persist();showApp();syncMessage(dirty?'Modifications à synchroniser.':'✓ Semaines synchronisées');prepareShell();if(dirty&&!conflicting)await push();
}
$('login-form').onsubmit=async event=>{
 event.preventDefault();const button=$('login-form').querySelector('button'),code=$('access-code').value;button.disabled=true;
 try{
  let credentials={code};if(window.ASC_CLOUDFLARE){const info=await api('/api/session');if(!info.salt)throw Error('Créez d’abord votre code personnel.');credentials={key:await cloudKey(code,info.salt)};}
  await api('/api/login',credentials);
  // Recover pending encrypted edits before accepting the remote snapshot.
  if(!dirty){try{const cached=await OfflineStore.unlock(code);if(cached.dirty)adoptCached(cached);}catch{}}
  try{await OfflineStore.prepare(code);}catch{$('offline-help').textContent='Ce navigateur ne permet pas la sauvegarde hors connexion.';}await openAccount();
 }catch(error){
  if((!error.status||error.status>=500)&&!(error.message==='Créez d’abord votre code personnel.')){
   try{adoptCached(await OfflineStore.unlock(code));connected=false;showApp();syncMessage('Hors connexion · données enregistrées sur cet appareil');}catch(localError){$('login-error').textContent=navigator.onLine?error.message:localError.message;}
  }else $('login-error').textContent=error.message;
 }finally{button.disabled=false;}
};
$('sync-now').onclick=async()=>{if(!connected){await reconnect();return;}if(dirty)await push();else await pull();};
async function reconnect(){
 if(!OfflineStore.ready())return;
 try{const info=await api('/api/session');if(!info.authenticated){await persist();showLogin('Entrez votre code pour synchroniser vos saisies hors connexion.');return;}await openAccount();}catch{syncMessage('Hors connexion · données conservées sur cet appareil');}
}
$('logout').onclick=async()=>{
 if(!await persist()&&dirty){alert('Téléchargez une sauvegarde avant de verrouiller : la sauvegarde locale a échoué.');return;}
 try{await api('/api/logout',{});}catch{try{localStorage.setItem('asc-logout-pending','1');}catch{}}
 OfflineStore.lock();connected=false;store=Timesheet.extras({name:'',weeks:{}});dirty=false;revision=0;conflicting=false;$('conflict').hidden=true;render();showLogin('Espace verrouillé. Entrez votre code pour le rouvrir.');
};
$('conflict-backup').onclick=()=>$('backup').click();
$('load-remote').onclick=async()=>{
 if(!confirm('Charger les semaines du serveur ? Faites une sauvegarde pour conserver aussi vos modifications locales.'))return;
 try{const result=await api('/api/state');store=checkStore(result.store);baseStore=copy(store);revision=result.revision;dirty=false;conflicting=false;generation++;$('conflict').hidden=true;await persist();render();syncMessage('✓ Version du serveur chargée');}catch(error){syncMessage(error.message,true);}
};
$('keep-local').onclick=async()=>{
 if(!confirm('Conserver cette version à la place de celle du serveur ? Les modifications concurrentes de l’autre appareil seront remplacées.'))return;
 try{const result=await api('/api/state');revision=result.revision;baseStore=checkStore(result.store);conflicting=false;$('conflict').hidden=true;dirty=true;generation++;await persist();await push();}catch(error){syncMessage(error.message,true);}
};
$('migrate-local').onclick=()=>{if(!confirm('Importer les anciennes semaines de ce navigateur ? Les mêmes semaines seront remplacées.'))return;const incoming=checkStore(legacy);incoming.recovery=store.recovery;store=mergeImported(store,incoming);save();render();$('migrate-local').hidden=true;};
window.addEventListener('beforeunload',event=>{if(dirty&&!cacheSaved){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',reconnect);window.addEventListener('offline',()=>syncMessage(cacheSaved?'Hors connexion · enregistré sur cet appareil':'Hors connexion · enregistrement local en cours'));
window.addEventListener('focus',()=>{if(connected)pull();else if(navigator.onLine)reconnect();});setInterval(()=>{if(connected)pull();else if(navigator.onLine)reconnect();renderReminder();},15000);
(async()=>{
 let cached=null,record=null;
 try{record=await OfflineStore.record();cached=await OfflineStore.restore();if(cached)adoptCached(cached);else if(record)window.ASC_CLOUDFLARE=!!record.cloud;}catch{}
 try{
  let logoutPending=false;try{logoutPending=!!localStorage.getItem('asc-logout-pending');}catch{}if(logoutPending){await api('/api/logout',{});try{localStorage.removeItem('asc-logout-pending');}catch{}}
  const session=await api('/api/session');window.ASC_CLOUDFLARE=session.deployment==='cloudflare';$('setup-help').hidden=session.configured||window.ASC_CLOUDFLARE;$('cloud-setup').hidden=session.configured||!window.ASC_CLOUDFLARE;$('login-form').hidden=!session.configured&&window.ASC_CLOUDFLARE;
  if(session.authenticated&&OfflineStore.ready())await openAccount();else showLogin();
 }catch{if(cached){connected=false;showApp();syncMessage('Hors connexion · données conservées sur cet appareil');}else showLogin(record?'Entrez votre code pour ouvrir vos données hors connexion.':'Ouvrez l’application une première fois avec Internet.');}
})();
$('cloud-setup-form').onsubmit=async event=>{
 event.preventDefault();const code=$('new-code').value;if(code!==$('confirm-code').value){$('setup-error').textContent='Les deux codes sont différents.';return;}
 const button=$('cloud-setup-form').querySelector('button');button.disabled=true;
 try{const salt=cloudHex(crypto.getRandomValues(new Uint8Array(16))),key=await cloudKey(code,salt),verifier=cloudHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)));await api('/api/setup',{salt,verifier,setupToken:$('setup-token').value});$('cloud-setup-form').reset();$('cloud-setup').hidden=true;$('login-form').hidden=false;showLogin('Code créé. Connectez-vous maintenant.');}
 catch(error){$('setup-error').textContent=error.message;}finally{button.disabled=false;}
};
function cloudHex(bytes){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
async function cloudKey(code,salt){if(!crypto.subtle)throw Error('Ouvrez l’application en HTTPS pour vous connecter.');const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveBits']);return cloudHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g),v=>parseInt(v,16)),iterations:100000,hash:'SHA-256'},base,256));}
