'use strict';
let connected=false, revision=0, dirty=false, generation=0, pending=null, busy=false, conflicting=false;
const legacy=JSON.parse(JSON.stringify(store));
store={name:'',weeks:{}};
function syncMessage(text,error=false){$('sync-status').textContent=text;$('sync-status').toggleAttribute('data-error',error);}
async function api(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const data=await response.json();
 if(!response.ok){const error=Error(data.error||'Connexion impossible.');error.status=response.status;throw error;}
 return data;
}
function showLogin(message=''){
 connected=false;$('application').hidden=true;$('login-panel').hidden=false;$('login-error').textContent=message;
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 $('access-code').value='';$('access-code').focus();
}
function syncSave(){
 dirty=true;generation++;$('status').textContent='Modifications enregistrées dans cette session.';
 syncMessage('Enregistrement en cours…');clearTimeout(pending);pending=setTimeout(push,600);
}
function showConflict(){conflicting=true;$('conflict').hidden=false;syncMessage('Choix nécessaire : deux versions de vos semaines.',true);}
async function push(){
 if(!connected||busy||conflicting)return false;
 if(!dirty){syncMessage('✓ Semaines synchronisées');return true;}
 busy=true;const sent=generation;
 try{const result=await api('/api/state',{revision,store:JSON.parse(JSON.stringify(store))});revision=result.revision;
  if(generation===sent)dirty=false;
  syncMessage(dirty?'Enregistrement en cours…':'✓ Semaines synchronisées');
  return !dirty;
 }catch(error){
  if(error.status===409)showConflict();
  else if(error.status===401)showLogin('Votre session a expiré. Reconnectez-vous ; vos modifications restent dans cette session.');
  else syncMessage('Non synchronisé. Gardez cette page ouverte ou téléchargez une sauvegarde.',true);
  return false;
 }finally{busy=false;if(dirty&&generation!==sent&&!conflicting&&connected)pending=setTimeout(push,300);}
}
async function pull(){
 if(!connected||busy||document.querySelector('dialog[open]')||document.activeElement===$('name'))return;
 if(dirty){await push();return;}
 busy=true;const before=generation;
 try{const result=await api('/api/state');
  if(generation!==before||dirty)return;
  if(result.revision!==revision){store=checkStore(result.store);revision=result.revision;render();}
  syncMessage('✓ Semaines synchronisées');
 }catch(error){if(error.status===401)showLogin('Reconnectez-vous pour retrouver vos semaines.');else syncMessage('Connexion indisponible. Aucune donnée supprimée.',true);}
 finally{busy=false;}
}
async function openAccount(){
 const result=await api('/api/state');
 if(!dirty){store=checkStore(result.store);revision=result.revision;}
 else if(result.revision!==revision)showConflict();
 connected=true;$('application').hidden=false;$('login-panel').hidden=true;$('access-code').value='';
 $('migrate-local').hidden=!Object.keys(legacy.weeks).some(k=>legacy.weeks[k].some(d=>d.length));
 render();syncMessage(dirty?'Modifications à synchroniser.':'✓ Semaines synchronisées');if(dirty&&!conflicting)await push();
}
$('login-form').onsubmit=async event=>{
 event.preventDefault();const button=$('login-form').querySelector('button');button.disabled=true;
 try{let credentials={code:$('access-code').value};if(window.ASC_CLOUDFLARE){const info=await api('/api/session');if(!info.salt)throw Error('Créez d’abord votre code personnel.');credentials={key:await cloudKey($('access-code').value,info.salt)};}await api('/api/login',credentials);await openAccount();}
 catch(error){$('login-error').textContent=error.message;}
 finally{button.disabled=false;}
};
$('sync-now').onclick=async()=>{if(dirty)await push();else await pull();};
$('logout').onclick=async()=>{
 if(dirty){await push();if(dirty){alert('Vos dernières modifications ne sont pas synchronisées. Téléchargez une sauvegarde et résolvez la synchronisation avant de verrouiller.');return;}}
 try{await api('/api/logout',{});store={name:'',weeks:{}};revision=0;showLogin();}catch{syncMessage('Impossible de verrouiller : vérifiez la connexion.',true);}
};
$('conflict-backup').onclick=()=>$('backup').click();
$('load-remote').onclick=async()=>{
 if(!confirm('Charger les semaines du serveur ? Les modifications non synchronisées de cet appareil seront abandonnées. Faites une sauvegarde si vous souhaitez les conserver.'))return;
 try{const result=await api('/api/state');store=checkStore(result.store);revision=result.revision;dirty=false;conflicting=false;generation++;$('conflict').hidden=true;render();syncMessage('✓ Version du serveur chargée');}catch(error){syncMessage(error.message,true);}
};
$('keep-local').onclick=async()=>{
 if(!confirm('Remplacer les semaines du serveur par cette version ? Les modifications effectuées sur l’autre appareil seront remplacées.'))return;
 try{const result=await api('/api/state');revision=result.revision;conflicting=false;$('conflict').hidden=true;dirty=true;await push();}catch(error){syncMessage(error.message,true);}
};
$('migrate-local').onclick=()=>{
 if(!confirm('Importer les anciennes semaines de ce navigateur dans votre espace ? Les semaines portant les mêmes dates seront remplacées.'))return;
 store={name:store.name||legacy.name,weeks:{...store.weeks,...legacy.weeks}};save();render();$('migrate-local').hidden=true;
};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>{if(dirty)push();else pull();});
window.addEventListener('focus',()=>pull());
setInterval(pull,15000);
(async()=>{try{const session=await api('/api/session');window.ASC_CLOUDFLARE=session.deployment==='cloudflare';$('setup-help').hidden=session.configured||window.ASC_CLOUDFLARE;$('cloud-setup').hidden=session.configured||!window.ASC_CLOUDFLARE;$('login-form').hidden=!session.configured&&window.ASC_CLOUDFLARE;if(session.authenticated)await openAccount();else showLogin();}catch{showLogin('Le serveur est indisponible. Réessayez dans un instant.');}})();

$('cloud-setup-form').onsubmit=async event=>{
 event.preventDefault();const code=$('new-code').value;
 if(code!==$('confirm-code').value){$('setup-error').textContent='Les deux codes sont différents.';return;}
 const button=$('cloud-setup-form').querySelector('button');button.disabled=true;
 try{const salt=cloudHex(crypto.getRandomValues(new Uint8Array(16)));const key=await cloudKey(code,salt);const verifier=cloudHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)));await api('/api/setup',{salt,verifier,setupToken:$('setup-token').value});$('cloud-setup-form').reset();$('cloud-setup').hidden=true;$('login-form').hidden=false;showLogin('Code créé. Connectez-vous maintenant.');}
 catch(error){$('setup-error').textContent=error.message;}finally{button.disabled=false;}
};

function cloudHex(bytes){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
async function cloudKey(code,salt){
 if(!crypto.subtle)throw Error('Ouvrez l’application en HTTPS pour vous connecter.');
 const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveBits']);
 return cloudHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g),v=>parseInt(v,16)),iterations:100000,hash:'SHA-256'},base,256));
}
