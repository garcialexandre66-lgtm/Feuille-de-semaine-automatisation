'use strict';
globalThis.OfflineStore=(()=>{
 let cryptoKey=null,salt=null,lastWrite=Promise.resolve();
 const tabKey='asc-offline-tab-key-v1';
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const encoded=data=>btoa(String.fromCharCode(...new Uint8Array(data)));
 let database;
 function db(){return database??=new Promise((resolve,reject)=>{const req=indexedDB.open('asc-private-offline',1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 async function record(){const connection=await db();return new Promise((resolve,reject)=>{const req=connection.transaction('records').objectStore('records').get('snapshot');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
 async function write(value){const connection=await db();return new Promise((resolve,reject)=>{const tx=connection.transaction('records','readwrite');tx.objectStore('records').put(value,'snapshot');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 async function derive(code,randomSalt){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(randomSalt),iterations:100000,hash:'SHA-256'},base,256));}
 async function activate(raw,randomSalt){cryptoKey=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);salt=randomSalt;try{sessionStorage.setItem(tabKey,JSON.stringify({key:encoded(raw),salt}));}catch{}}
 async function decrypt(saved,key){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv},key,saved.payload);return JSON.parse(new TextDecoder().decode(plain));}
 async function restore(){const saved=await record();if(!saved)return null;let tab;try{tab=JSON.parse(sessionStorage.getItem(tabKey));}catch{}if(!tab||tab.salt!==saved.salt)return null;try{await activate(bytes(tab.key),saved.salt);return await decrypt(saved,cryptoKey);}catch{lock();return null;}}
 async function unlock(code){const saved=await record();if(!saved)throw Error('Connectez-vous une première fois avec Internet pour préparer le mode hors connexion.');
  try{const raw=await derive(code,saved.salt),key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);const snapshot=await decrypt(saved,key);await activate(raw,saved.salt);return snapshot;}catch{throw Error('Ce code ne déverrouille pas les données hors connexion de cet appareil.');}
 }
 async function prepare(code){const saved=await record();const randomSalt=saved?.salt||encoded(crypto.getRandomValues(new Uint8Array(16)));await activate(await derive(code,randomSalt),randomSalt);}
 function persist(snapshot){
  if(!cryptoKey)return Promise.reject(Error('Reconnectez-vous avec votre code pour préparer l’enregistrement hors connexion.'));
  const data=new TextEncoder().encode(JSON.stringify(snapshot)),key=cryptoKey,currentSalt=salt;
  lastWrite=lastWrite.catch(()=>{}).then(async()=>{const iv=crypto.getRandomValues(new Uint8Array(12)),payload=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);await write({iv,payload,salt:currentSalt,cloud:snapshot.deployment==='cloudflare'});});
  return lastWrite;
 }
 function lock(){cryptoKey=null;salt=null;try{sessionStorage.removeItem(tabKey);}catch{}}
 return {record,restore,unlock,prepare,persist,lock,ready:()=>!!cryptoKey,flush:()=>lastWrite};
})();
if('serviceWorker' in navigator){
 let controlled=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(controlled)$('update-ready').hidden=false;controlled=true;});
 $('reload-app').onclick=async()=>{if(document.querySelector('#editor[open]')&&!confirm('Fermer la saisie en cours pour actualiser ? Les champs non enregistrés seront perdus.'))return;try{await OfflineStore.flush();location.reload();}catch{$('status').textContent='Téléchargez une sauvegarde avant d’actualiser : la sauvegarde locale a échoué.';}};
}
