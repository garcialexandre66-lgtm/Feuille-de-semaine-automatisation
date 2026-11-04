'use strict';
const pushSection=node('section',null,'settings-push'),pushTitle=node('h3','Notifications sur mon téléphone'),pushText=node('p','Chaque vendredi à 18 h, puis 10 minutes après si la feuille n’est toujours pas envoyée.'),pushTimeLabel=node('label','Heure du vendredi · Paris'),pushTime=node('input'),pushEnable=node('button','Activer les notifications'),pushDisable=node('button','Désactiver sur ce téléphone'),pushMessage=node('p',null,'hint');
pushSection.id='settings-push';pushTime.type='time';pushTime.value='18:00';pushTime.id='push-reminder-time';pushTimeLabel.append(pushTime);pushEnable.type=pushDisable.type='button';pushEnable.id='push-enable';pushDisable.id='push-disable';pushDisable.hidden=true;pushMessage.id='push-status';pushMessage.setAttribute('role','status');pushSection.append(pushTitle,pushText,pushTimeLabel,pushEnable,pushDisable,pushMessage);$('settings-dialog').querySelector('.settings-shortcuts').before(pushSection);
let pushPublicKey=null,pushSubscription=null,pushBusy=false,pushEnabled=false;
const pushBase64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
function pushSupport(){
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),standalone=!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
 if(ios&&!standalone)return 'Sur iPhone : ouvre l’application dans Safari, puis Partager → Sur l’écran d’accueil. Ouvre ensuite son icône et active les notifications ici.';
 if(!('Notification'in window)||!('serviceWorker'in navigator)||!('PushManager'in window))return 'Ce navigateur ne prend pas en charge ces notifications. Sur iPhone, utilise l’application sur l’écran d’accueil avec iOS 16.4 ou plus récent.';
 if(Notification.permission==='denied')return 'Les notifications sont bloquées. Autorise-les dans les réglages de notification du téléphone pour cette application.';
 return '';
}
function pushSummary(time){pushText.textContent='Chaque vendredi à '+time.replace(':',' h ')+', puis 10 minutes après si la feuille n’est toujours pas envoyée.';}
async function loadPushSettings(){
 if(pushBusy)return;
 const unsupported=pushSupport();pushEnable.disabled=!!unsupported;pushMessage.textContent=unsupported||'Vérification des notifications…';if(unsupported)return;
 try{
  const info=await api('/api/push');pushPublicKey=info.publicKey;
  const registration=await navigator.serviceWorker.getRegistration();pushSubscription=registration?await registration.pushManager.getSubscription():null;
  const state=pushSubscription?await api('/api/push/status',{endpoint:pushSubscription.endpoint}):{enabled:false,time:'18:00'};
  pushEnabled=state.enabled;pushTime.value=state.time;pushSummary(state.time);pushDisable.hidden=!pushEnabled;pushEnable.textContent=pushEnabled?'Enregistrer l’heure du rappel':'Activer les notifications';pushMessage.textContent=pushEnabled?'Notifications activées sur ce téléphone. Le second rappel est annulé si la feuille est envoyée.':'Active-les une seule fois sur ce téléphone.';
 }catch(error){pushMessage.textContent='Vérification impossible : '+error.message;}
}
pushEnable.onclick=async()=>{
 if(pushBusy)return;const unsupported=pushSupport();if(unsupported){pushMessage.textContent=unsupported;return;}
 // iOS requires permission to be requested directly from the button gesture.
 const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
 pushBusy=true;pushEnable.disabled=true;pushDisable.disabled=true;pushTime.disabled=true;pushMessage.textContent='Activation des notifications…';
 try{
  if(await permission!=='granted')throw Error('Autorise les notifications pour recevoir le rappel.');
  if(!pushPublicKey)pushPublicKey=(await api('/api/push')).publicKey;
  let registration=await navigator.serviceWorker.getRegistration();if(!registration)registration=await navigator.serviceWorker.register('/sw.js');registration=await navigator.serviceWorker.ready;
  pushSubscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushBase64(pushPublicKey)});
  const state=await api('/api/push/subscribe',{subscription:pushSubscription.toJSON(),time:pushTime.value});pushEnabled=true;pushSummary(state.time);pushEnable.textContent='Enregistrer l’heure du rappel';pushDisable.hidden=false;pushMessage.textContent='C’est activé : rappel le vendredi à '+state.time.replace(':',' h ')+', puis 10 minutes après seulement si la feuille n’est pas envoyée.';
 }catch(error){pushMessage.textContent='Activation impossible : '+error.message;}
 finally{pushBusy=false;pushEnable.disabled=false;pushDisable.disabled=false;pushTime.disabled=false;}
};
pushDisable.onclick=async()=>{
 if(pushBusy||!pushSubscription)return;pushBusy=true;pushDisable.disabled=pushEnable.disabled=true;
 try{
  await api('/api/push/unsubscribe',{endpoint:pushSubscription.endpoint});pushEnabled=false;pushDisable.hidden=true;pushEnable.textContent='Activer les notifications';pushMessage.textContent='Notifications désactivées sur ce téléphone.';
  try{await pushSubscription.unsubscribe();pushSubscription=null;}catch{}
 }catch(error){pushMessage.textContent='Désactivation impossible : '+error.message;}
 finally{pushBusy=false;pushDisable.disabled=pushEnable.disabled=false;}
};
const pushOriginalSettings=openSettings;openSettings=function(){pushOriginalSettings();void loadPushSettings();};$('settings-open').onclick=openSettings;
function openReminderWeek(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||monday(value)!==value)return;
 if($('application').hidden)return;
 if(typeof confirmDiscardEdits==='function'&&!confirmDiscardEdits())return;
 week=value;expandedDay=null;selected=0;render();if($('settings-dialog').open)$('settings-dialog').close();window.scrollTo({top:0,behavior:'auto'});
}
navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='open-week-reminder')openReminderWeek(event.data.week);});
function readReminderLink(){const value=new URLSearchParams(location.search).get('rappel');if(!value)return;openReminderWeek(value);}
const reminderApplicationObserver=new MutationObserver(()=>{if(!$('application').hidden){readReminderLink();reminderApplicationObserver.disconnect();}});reminderApplicationObserver.observe($('application'),{attributes:true,attributeFilter:['hidden']});if(!$('application').hidden)readReminderLink();
