'use strict';
const statusText=document.getElementById('recovery-status'),retry=document.getElementById('recovery-retry'),open=document.getElementById('recovery-open');
open.href='/'+location.hash;
function activated(worker){return new Promise((resolve,reject)=>{
 if(worker.state==='activated'){resolve();return;}
 const timer=setTimeout(()=>{worker.removeEventListener('statechange',check);reject(Error('La mise à jour prend plus de temps. Vérifiez votre connexion et réessayez.'));},45000);
 function check(){if(worker.state==='activated'){clearTimeout(timer);worker.removeEventListener('statechange',check);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',check);reject(Error('La mise à jour n’a pas abouti. Réessayez avec une connexion Internet.'));}}
 worker.addEventListener('statechange',check);check();
});}
async function repair(){
 retry.hidden=true;open.hidden=true;statusText.textContent='Mise à jour du mode hors connexion…';
 try{
  if('serviceWorker' in navigator){
   let registration=await navigator.serviceWorker.getRegistration('/');
   if(registration)await registration.update();else registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
   const worker=registration.installing||registration.waiting;if(worker)await activated(worker);
  }
  statusText.textContent='Réparation terminée. Ouverture de votre application…';open.hidden=false;location.replace(open.href);
 }catch(error){statusText.textContent=error.message||'Impossible de terminer. Vérifiez votre connexion et réessayez.';retry.hidden=false;}
}
retry.onclick=repair;void repair();
