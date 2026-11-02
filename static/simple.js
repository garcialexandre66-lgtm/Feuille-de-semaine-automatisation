'use strict';
let expandedDay=null,pendingReview=null,pendingShare=false;
const originalSetView=setView;
setView=function(view){
 if(view==='month'){openMonth();return;}
 currentView='day';originalSetView('day');
 if($('history-dialog').open)$('history-dialog').close();
 renderSimple();
};
const originalOpenEditor=openEditor;
openEditor=function(index=-1){
 originalOpenEditor(index);
 for(const key of ['prep','intervention'])$('form').elements[key].value=index<0?'':days()[selected][index][key]||'';
};
showStep=function(){
 for(const page of document.querySelectorAll('.wizard-page'))page.hidden=false;
 $('previous').hidden=true;$('next').textContent='Enregistrer';$('step-count').hidden=true;
 $('remember-favorite-label').hidden=isWorkshop();
};
$('form').onsubmit=event=>{
 event.preventDefault();try{
  for(const input of $('form').querySelectorAll('input:not(:disabled)'))if(!input.checkValidity()){input.reportValidity();return;}
  const {item,day}=readItem();if($('remember-favorite').checked&&!isWorkshop())rememberFavoriteItem(item);
  store.weeks[week][selected]=day;if(selected>=5)expandedDay=selected;save();render();$('editor').close();showDayConfirmation(day);
 }catch(error){$('error').textContent=error.message;}
};
// A short celebration and a readable snapshot of the day just entered.
const dayConfirmation=node('dialog',null,'day-confirmation');
dayConfirmation.id='day-confirmation';dayConfirmation.setAttribute('aria-labelledby','day-confirmation-title');
dayConfirmation.setAttribute('aria-describedby','day-confirmation-date');
document.body.append(dayConfirmation);
function showDayConfirmation(day){
 const snapshot=JSON.parse(JSON.stringify(day));
 const date=new Date(week+'T12:00:00');date.setDate(date.getDate()+selected);
 const content=node('div',null,'day-confirmation-content'),badge=node('div',null,'day-confirmation-check');
 badge.setAttribute('aria-hidden','true');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 52 52');svg.setAttribute('fill','none');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');
 path.setAttribute('d','M14 27l8 8 17-18');path.setAttribute('stroke','currentColor');
 path.setAttribute('stroke-width','4');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
 svg.append(path);badge.append(svg);
 const eyebrow=node('p','Bien joué !','day-confirmation-eyebrow'),title=node('h2','Votre journée en résumé'),dateLabel=node('p',date.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),'day-confirmation-date');
 title.id='day-confirmation-title';dateLabel.id='day-confirmation-date';
 const total=node('div',null,'day-confirmation-total');
 total.append(node('span','Total de la journée'),node('strong',fmt(daySum(snapshot))));
 const list=node('ul',null,'day-confirmation-list');
 for(const item of snapshot){
  const line=node('li'),heading=node('div',null,'day-confirmation-line'),place=node('div');
  place.append(node('strong',item.client||'Temps pour l’entreprise'));
  if(item.city)place.append(node('span',item.city));
  heading.append(place,node('strong',fmt(sum(item))));line.append(heading);
  const details=fields.flatMap((key,index)=>item[key]?[labels[index]+' : '+fmt(item[key])]:[]);
  if(details.length)line.append(node('p',details.join(' · ')));
  list.append(line);
 }
 const hint=node('p','Vous pouvez encore modifier les heures ou ajouter une intervention.','day-confirmation-hint');
 const close=node('button','Continuer','primary');close.type='button';close.autofocus=true;close.id='day-confirmation-close';
 close.onclick=()=>dayConfirmation.close();
 content.append(badge,eyebrow,title,dateLabel,total,list,hint,close);
 dayConfirmation.replaceChildren(content);dayConfirmation.showModal();
}

// Keep the existing, tested calculations and entry editing in the expanded card.
const dayPanel=$('view-day');
// Reuse yesterday without sharing entry objects with the original day.
function previousDaySource(){
 const date=new Date(week+'T12:00:00');date.setDate(date.getDate()+selected-1);
 const key=iso(date),sourceWeek=monday(key),index=(date.getDay()+6)%7;
 const entries=store.weeks[sourceWeek]?.[index]||[];
 return {date:key,entries:entries.filter(item=>!isAbsence(item))};
}
const repeatYesterday=node('button','Reprendre la journée d’hier','workshop-shortcut'),repeatYesterdayHelp=node('p',null,'hint');
repeatYesterday.id='repeat-yesterday';repeatYesterday.type='button';repeatYesterdayHelp.id='repeat-yesterday-help';
repeatYesterday.setAttribute('aria-describedby',repeatYesterdayHelp.id);
$('add').after(repeatYesterday,repeatYesterdayHelp);
function renderRepeatYesterday(){
 const source=previousDaySource();
 repeatYesterday.disabled=!source.entries.length;
 const date=new Date(source.date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'2-digit'});
 repeatYesterdayHelp.textContent=source.entries.length
  ?'Reprendre '+date+' : client, chantier, trajet et heures. Vous pourrez ensuite les modifier.'
  :'Aucune intervention à reprendre le '+date+'. Choisissez « Copier une journée » dans le menu ci-dessous pour une autre date.';
}
repeatYesterday.onclick=()=>{
 const source=previousDaySource();if(!source.entries.length)return;
 if(days()[selected].length&&!confirm('Remplacer les interventions de cette journée par celles d’hier ?'))return;
 store.weeks[week][selected]=JSON.parse(JSON.stringify(source.entries));
 save();render();
 $('status').textContent='Journée reprise. Utilisez « Modifier » pour ajuster le chantier et les heures.';
};

const overtimeStrip=node('section',null,'overtime-strip'),overtimeInfo=node('div'),overtimeTitle=node('strong','Total de la semaine'),overtimeValue=node('strong'),overtimeNote=node('p');
const overtimeFigure=node('div',null,'week-hours-figure'),overtimeExtra=node('p'),overtimeLink=node('a','Consulter vos heures sup','overtime-link');
overtimeValue.id='automatic-overtime';overtimeNote.id='automatic-overtime-note';overtimeExtra.id='weekly-overtime-excess';overtimeExtra.setAttribute('aria-live','polite');overtimeLink.id='consult-overtime';overtimeLink.href='#heures-supplementaires';
overtimeLink.onclick=event=>{event.preventDefault();openMonth();$('month-dialog').querySelector('.dialog-title h2').textContent='Mes heures supplémentaires';$('recovery-balance').setAttribute('tabindex','-1');$('recovery-balance').focus();};
overtimeInfo.append(overtimeTitle,overtimeNote);overtimeFigure.append(overtimeValue,overtimeExtra);overtimeStrip.append(overtimeInfo,overtimeFigure,overtimeLink);$('simple-home').insertBefore(overtimeStrip,$('simple-home').querySelector('.download-bar'));
$('recovery-earned').parentElement.firstChild.textContent='Heures calculées ';
$('validate-credit').textContent='Confirmer ce montant';
$('validate-credit').closest('details').querySelector('summary').textContent='Corriger ou confirmer une semaine';
function renderSimple(){
 if(!$('simple-home'))return;
 renderRepeatYesterday();
 resetDayAction();
 const date=new Date(week+'T12:00:00'),end=new Date(date);end.setDate(end.getDate()+4);
 const short=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
 $('simple-week').textContent=`Semaine du ${short(date)} au ${short(end)}`;
 $('simple-year').textContent=date.getFullYear()===end.getFullYear()?String(date.getFullYear()):`${date.getFullYear()} – ${end.getFullYear()}`;
 // Move the live editor before replacing its previous card.
 $('application').append(dayPanel);dayPanel.hidden=true;
 const cards=days().slice(0,5).map((day,index)=>dayCard(day,index));
 $('week-cards').replaceChildren(...cards);
 const weekend=days().slice(5).flatMap((day,index)=>expandedDay===index+5||day.some(item=>!isAbsence(item)&&sum(item)>0)?[dayCard(day,index+5)]:[]);
 $('oncall').hidden=!weekend.length;$('oncall-cards').replaceChildren(...weekend);
 $('oncall').querySelector('h2').textContent=days().slice(5).some(day=>day.some(item=>!isAbsence(item)&&sum(item)>0))?'Astreinte':'Week-end';
 $('check-pdf').hidden=expandedDay!==null;
 gmailButton.hidden=expandedDay!==null;
 const weekMinutes=days().reduce((minutes,day)=>minutes+daySum(day),0),extra=Math.max(0,weekMinutes-2100);
 overtimeValue.textContent=fmt(weekMinutes);
 overtimeStrip.classList.toggle('over-limit',extra>0);
 overtimeExtra.hidden=extra===0;overtimeExtra.textContent=extra?'+'+fmt(extra)+' d’heures sup':'';
 overtimeNote.textContent=weekMinutes<2100?fmt(2100-weekMinutes)+' restantes pour atteindre 35 h':'Objectif de 35 h atteint';
 renderDailyTools();
}
function dayCard(day,index){
 const card=node('details',null,'week-card'),summary=node('summary'),heading=node('div',null,'card-heading');
 const d=new Date(week+'T12:00:00');d.setDate(d.getDate()+index);
 heading.append(node('strong',names[index]),node('span',d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})));
 if(iso(d)===iso(new Date())){heading.append(node('span','Aujourd’hui','today-badge'));card.classList.add('is-today');card.setAttribute('aria-current','date');}
 const clients=node('p',day.length?[...new Set(day.map(item=>item.client||'Sans client'))].join(', '):'À remplir','card-clients');
 const issues=SheetReview.dayIssues(day),state=!day.length?'empty':issues.length?'check':'ok';
 const right=node('div',null,'card-right'),indicator=node('span',state==='empty'?'Vide':state==='check'?issues.join(' · '):isDayCompleted(iso(d),day)?'✓ Terminée':'OK','card-state');indicator.dataset.state=state;
 card.dataset.completed=String(isDayCompleted(iso(d),day));
 right.append(node('strong',fmt(daySum(day))),indicator);
 const extra=Timesheet.dayOvertime(day);if(extra)right.append(node('span',fmt(extra)+' sup dans la journée','card-state'));
 summary.append(heading,clients,right);card.append(summary);card.dataset.day=String(index);
 card.open=expandedDay===index;
 if(card.open){card.append(dayPanel);dayPanel.hidden=false;}
 summary.onclick=event=>{event.preventDefault();expandedDay=expandedDay===index?null:index;if(expandedDay!==null)selected=index;render();};
 return card;
}
for(const [id,offset] of [['week-back',-7],['week-forward',7]])$(id).onclick=()=>{const d=new Date(week+'T12:00:00');d.setDate(d.getDate()+offset);week=iso(d);expandedDay=null;render();};
function checkedPayload(){
 if(!store.name.trim()){openSettings();$('name').focus();$('status').textContent='Renseignez votre nom pour le PDF.';return null;}
 const payload=JSON.parse(JSON.stringify({name:store.name,week,days:days()}));
 if(!payload.days.some(day=>day.length)){$('status').textContent='Cette semaine est vide. Ouvrez une journée ou retrouvez une semaine dans les réglages.';return null;}
 return payload;
}
async function downloadChecked(payload,share=false){
 const buttons=[$('check-pdf'),gmailButton];buttons.forEach(button=>button.disabled=true);
 try{
  const file=new File([await weekBlob(true,{...payload,days:payload.days.slice(0,5)})],pdfFilename(payload),{type:'application/pdf'});
  if(share==='gmail'){prepareGmail(file,payload);return;}
  if(share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Ma feuille de semaine'});$('status').textContent='Menu de partage fermé.';}catch(error){if(error.name==='AbortError')return;if(error.name!=='NotAllowedError')throw error;download(file,file.name);$('status').textContent='PDF téléchargé. Vous pouvez le joindre à votre message.';}}
  else{download(file,file.name);$('status').textContent='PDF téléchargé.';}
 }
 catch(error){$('status').textContent='Téléchargement impossible : '+error.message;}
 finally{buttons.forEach(button=>button.disabled=false);}
}
async function reviewPdf(share=false){
 const payload=checkedPayload();if(!payload)return;
 const issues=SheetReview.weekIssues(payload.days);
 renderPdfOverview(payload);
 pendingReview=payload;pendingShare=share;$('review-download').textContent=share==='gmail'?'Préparer l’envoi Gmail':share?'Continuer le partage':issues.length?'Télécharger quand même':'Télécharger le PDF';$('review-list').replaceChildren(...issues.map(issue=>node('li',issue.message)));$('review-clear').hidden=issues.length>0;$('review-dialog').showModal();
}
$('check-pdf').onclick=()=>reviewPdf();
$('share-pdf').onclick=()=>{if($('settings-dialog').open)$('settings-dialog').close();return reviewPdf(true);};
for(const id of ['review-close','review-fix'])$(id).onclick=()=>{$('review-dialog').close();pendingReview=null;};
$('review-download').onclick=async()=>{const payload=pendingReview,share=pendingShare;pendingReview=null;pendingShare=false;$('review-dialog').close();if(payload)await downloadChecked(payload,share);};
$('review-dialog').addEventListener('cancel',()=>{pendingReview=null;});
$('settings-connection').append($('application').querySelector('.account-bar'));
$('settings-document-actions').append($('share-pdf'),$('mark-sent'),$('export-ods'));
$('history-content').append($('history-list'));
$('month-content').append($('view-month'));$('view-month').hidden=false;
const monthlyOncall=node('p');monthlyOncall.id='monthly-oncall';$('view-month').append(monthlyOncall);
function openMonth(){
 $('month-dialog').querySelector('.dialog-title h2').textContent='Mon récapitulatif';
 if($('settings-dialog').open)$('settings-dialog').close();currentView='month';renderMonth();$('view-month').hidden=false;
 $('month-dialog').showModal();
}
function renderMonthlyOncall(){
 const month=$('month').value;let minutes=0,count=0;
 for(const [key,ds] of Object.entries(store.weeks))ds.slice(5).forEach((day,i)=>{const date=new Date(key+'T12:00:00');date.setDate(date.getDate()+5+i);if(!iso(date).startsWith(month))return;for(const item of day)if(!isAbsence(item)&&sum(item)>0){minutes+=sum(item);count++;}});
 monthlyOncall.textContent=`Interventions le week-end : ${count} · ${fmt(minutes)}. Ces heures sont déjà incluses dans les heures saisies. Aucune prime d’astreinte n’est calculée.`;
}
const originalRenderMonth=renderMonth;
renderMonth=function(){originalRenderMonth();renderMonthlyOncall();};
$('open-month').onclick=openMonth;$('month-close').onclick=()=>{$('month-dialog').close();currentView='day';};
$('month-dialog').addEventListener('close',()=>{currentView='day';});
$('open-history').onclick=()=>{$('settings-dialog').close();renderHistory();$('history-dialog').showModal();};
$('history-close').onclick=()=>$('history-dialog').close();
const weekendButton=node('button','Ajouter une intervention le week-end');weekendButton.type='button';$('settings-document-actions').append(weekendButton);
const weekendDialog=node('dialog'),weekendTitle=node('h2','Intervention le week-end'),weekendForm=node('form'),weekendDate=document.createElement('input'),weekendLabel=node('label','Date de l’intervention');
weekendDate.type='date';weekendDate.required=true;weekendLabel.append(weekendDate);const weekendActions=node('div',null,'review-actions'),weekendCancel=node('button','Annuler'),weekendNext=node('button','Continuer','primary'),weekendError=node('p');weekendError.setAttribute('role','alert');weekendCancel.type='button';weekendNext.type='submit';weekendActions.append(weekendCancel,weekendNext);weekendForm.append(weekendLabel,weekendError,weekendActions);weekendDialog.append(weekendTitle,weekendForm);document.body.append(weekendDialog);
weekendButton.onclick=()=>{$('settings-dialog').close();const date=new Date(week+'T12:00:00');date.setDate(date.getDate()+5);weekendDate.value=iso(date);weekendError.textContent='';weekendDialog.showModal();};weekendCancel.onclick=()=>weekendDialog.close();
weekendForm.onsubmit=event=>{event.preventDefault();const date=weekendDate.value,index=(new Date(date+'T12:00:00').getDay()+6)%7;if(index<5){weekendError.textContent='Choisissez un samedi ou un dimanche.';return;}week=monday(date);selected=index;if(days()[index].length>=8){weekendError.textContent='Cette journée contient déjà huit lignes.';return;}weekendDialog.close();expandedDay=index;render();openEditor();};
// In the daily editor, less common actions live behind one disclosure.
const choices=dayPanel.querySelector('.day-more');
choices.querySelector('.day-tools').prepend($('workshop-day'));choices.hidden=true;
const dayActionToggle=node('button',null,'day-action-toggle'),dayActionMenu=node('div',null,'day-action-menu');
dayActionToggle.id='day-action-toggle';dayActionToggle.type='button';
dayActionToggle.append(node('span','Autres choix'),node('span','⌄','day-action-chevron'));
dayActionToggle.lastChild.setAttribute('aria-hidden','true');
dayActionMenu.id='day-action-menu';dayActionMenu.hidden=true;dayActionMenu.setAttribute('role','group');dayActionMenu.setAttribute('aria-label','Actions pour cette journée');
dayActionToggle.setAttribute('aria-controls',dayActionMenu.id);dayActionToggle.setAttribute('aria-expanded','false');
choices.after(dayActionToggle);document.body.append(dayActionMenu);
const dayActionIds=['workshop-day','copy-day','leave','sick','recovery-day'];
for(const id of dayActionIds){
 const button=node('button',$(id).textContent);button.type='button';button.dataset.action=id;
 button.onclick=()=>{if($(id).disabled)return;closeDayAction();dayActionToggle.focus();$(id).click();};
 dayActionMenu.append(button);
}
function closeDayAction(focus=false){
 dayActionMenu.hidden=true;dayActionToggle.setAttribute('aria-expanded','false');
 if(focus)dayActionToggle.focus();
}
function resetDayAction(){
 closeDayAction();
 for(const button of dayActionMenu.querySelectorAll('button'))button.disabled=!!$(button.dataset.action).disabled;
}
function openDayAction(focus=false){
 resetDayAction();dayActionMenu.hidden=false;dayActionToggle.setAttribute('aria-expanded','true');
 const rect=dayActionToggle.getBoundingClientRect(),gap=8;
 dayActionMenu.style.width=Math.min(rect.width,window.innerWidth-24)+'px';
 dayActionMenu.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-dayActionMenu.offsetWidth-12))+'px';
 const below=window.innerHeight-rect.bottom-gap-12,above=rect.top-gap-12;
 const top=below>=dayActionMenu.scrollHeight||below>=above;
 dayActionMenu.style.maxHeight=Math.max(80,top?below:above)+'px';
 dayActionMenu.style.top=(top?rect.bottom+gap:Math.max(12,rect.top-gap-dayActionMenu.offsetHeight))+'px';
 if(focus)dayActionMenu.querySelector('button:not(:disabled)')?.focus();
}
dayActionToggle.onclick=()=>dayActionMenu.hidden?openDayAction():closeDayAction();
dayActionToggle.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();openDayAction(true);}};
dayActionMenu.onkeydown=event=>{
 const buttons=[...dayActionMenu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}
};
document.addEventListener('pointerdown',event=>{if(!dayActionMenu.contains(event.target)&&!dayActionToggle.contains(event.target))closeDayAction();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dayActionMenu.hidden){event.preventDefault();closeDayAction(true);}});
document.addEventListener('focusin',event=>{if(!dayActionMenu.contains(event.target)&&!dayActionToggle.contains(event.target))closeDayAction();});
window.addEventListener('resize',()=>closeDayAction());
window.addEventListener('scroll',event=>{if(!dayActionMenu.contains(event.target))closeDayAction();},true);

$('previous-day').hidden=true;$('next-day').hidden=true;
const gmailButton=node('button','Envoyer par Gmail','gmail-button');gmailButton.id='gmail-pdf';gmailButton.type='button';gmailButton.onclick=()=>reviewPdf('gmail');$('simple-home').querySelector('.download-bar').append(gmailButton);
const gmailDialog=node('dialog'),gmailTitle=node('h2','Envoyer à la secrétaire'),gmailHeading=node('div',null,'dialog-title'),gmailClose=node('button','✕'),gmailRecipient=node('p','À : s.sanchez@asc66.fr'),gmailHelp=node('p',null,'hint'),gmailActions=node('div',null,'review-actions'),gmailApp=node('a','Ouvrir le brouillon dans l’application','gmail-compose primary'),gmailShare=node('button','Partager le PDF','primary'),gmailWeb=node('a','Ouvrir le brouillon dans Gmail sur le web','gmail-compose'),gmailMessage=node('p'),gmailShareDetails=node('details'),gmailShareNote=node('p','Cette option joint le PDF, mais tu dois renseigner le destinataire dans Gmail.','hint');
gmailDialog.id='gmail-dialog';gmailDialog.setAttribute('aria-label','Envoyer la feuille par Gmail');gmailClose.type='button';gmailClose.setAttribute('aria-label','Fermer');gmailClose.onclick=()=>gmailDialog.close();gmailApp.id='gmail-app-compose';gmailShare.type='button';gmailShare.id='gmail-native-share';gmailWeb.id='gmail-compose';gmailWeb.target='_blank';gmailWeb.rel='noopener noreferrer';gmailMessage.setAttribute('role','status');gmailHeading.append(gmailTitle,gmailClose);gmailActions.append(gmailApp,gmailWeb);gmailShareDetails.append(node('summary','Autre option : partager le PDF joint'),gmailShareNote,gmailShare);gmailDialog.append(gmailHeading,gmailRecipient,gmailHelp,gmailActions,gmailShareDetails,gmailMessage);document.body.append(gmailDialog);
function prepareGmail(file,payload){
 gmailShareDetails.id='gmail-share-options';gmailShareDetails.open=false;
 const subject=file.name.replace(/\.pdf$/i,''),body='Bonjour,\nVoici ma feuille de semaine en piece jointe.\nGarcia Alexandre';
 let preview=gmailDialog.querySelector('.gmail-body-preview');if(!preview){preview=node('p',null,'gmail-body-preview');gmailDialog.insertBefore(preview,gmailHelp);}preview.textContent=body;
 const url=new URL('https://mail.google.com/mail/');url.search=new URLSearchParams({view:'cm',fs:'1',to:'s.sanchez@asc66.fr',su:subject,body}).toString();
 gmailApp.href='mailto:s.sanchez@asc66.fr?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body.replace(/\n/g,'\r\n'));
 const downloadForCompose=()=>{download(file,file.name);gmailMessage.textContent='PDF téléchargé. Joins-le avec le trombone avant d’envoyer le brouillon.';};
 gmailApp.onclick=downloadForCompose;gmailWeb.href=url.href;gmailWeb.onclick=downloadForCompose;
 const canShare=!!navigator.canShare?.({files:[file]});gmailShareDetails.hidden=!canShare;gmailMessage.textContent='';
 gmailHelp.textContent='Le brouillon contient l’adresse de Suzie et ton message. Le PDF sera téléchargé : joins-le avec le trombone. L’application ouverte est celle choisie pour les e-mails sur ton téléphone.';
 gmailShare.onclick=async()=>{try{await navigator.share({files:[file],title:subject,text:body});gmailMessage.textContent='Menu de partage fermé. Vérifie le destinataire dans Gmail.';}catch(error){if(error.name!=='AbortError')gmailMessage.textContent='Utilise « Ouvrir le brouillon » puis joins le PDF téléchargé.';}};
 gmailDialog.showModal();
}
async function deliveryStatus(){
 try{const data=await api('/api/delivery');$('delivery-status').textContent=data.connected?'Gmail et Drive connectés.':data.configured?'Connectez votre compte Google.':'Envoi désactivé : la connexion Google doit être configurée sur Cloudflare.';$('connect-google').disabled=!data.configured;
  const config=data.settings||{};$('delivery-to').value=config.to||'';$('delivery-copy').value=config.copy||'';$('delivery-time').value=config.time||'17:00';$('delivery-enabled').checked=!!config.enabled;
  if(data.last)$('delivery-message').textContent=data.last.message||data.last.status;
 }catch{$('delivery-status').textContent='Connexion nécessaire pour régler les envois.';}
}
const originalSettings=openSettings;
openSettings=function(){
 for(const details of $('settings-dialog').querySelectorAll('details'))details.open=false;
 originalSettings();$('settings-dialog').scrollTop=0;
};
$('settings-delivery').addEventListener('toggle',()=>{if($('settings-delivery').open)deliveryStatus();});
$('settings-open').onclick=openSettings;
$('connect-google').onclick=async()=>{try{const result=await api('/api/google/start',{});location.assign(result.url);}catch(error){$('delivery-message').textContent=error.message;}};
$('delivery-form').onsubmit=async event=>{event.preventDefault();try{const result=await api('/api/delivery',{to:$('delivery-to').value,copy:$('delivery-copy').value,time:$('delivery-time').value,enabled:$('delivery-enabled').checked});$('delivery-message').textContent=result.message;}catch(error){$('delivery-message').textContent=error.message;}};
