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
  store.weeks[week][selected]=day;if(selected>=5)expandedDay=selected;save();render();$('editor').close();
 }catch(error){$('error').textContent=error.message;}
};
// Keep the existing, tested calculations and entry editing in the expanded card.
const dayPanel=$('view-day');
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
 if(expandedDay>=5&&!days()[expandedDay].some(item=>!isAbsence(item)&&sum(item)>0))expandedDay=null;
 const date=new Date(week+'T12:00:00'),end=new Date(date);end.setDate(end.getDate()+4);
 const short=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
 $('simple-week').textContent=`Semaine du ${short(date)} au ${short(end)}`;
 $('simple-year').textContent=date.getFullYear()===end.getFullYear()?String(date.getFullYear()):`${date.getFullYear()} – ${end.getFullYear()}`;
 // Move the live editor before replacing its previous card.
 $('application').append(dayPanel);dayPanel.hidden=true;
 const cards=days().slice(0,5).map((day,index)=>dayCard(day,index));
 $('week-cards').replaceChildren(...cards);
 const weekend=days().slice(5).flatMap((day,index)=>day.some(item=>!isAbsence(item)&&sum(item)>0)?[dayCard(day,index+5)]:[]);
 $('oncall').hidden=!weekend.length;$('oncall-cards').replaceChildren(...weekend);
 $('check-pdf').hidden=expandedDay!==null;
 const weekMinutes=days().reduce((minutes,day)=>minutes+daySum(day),0),extra=Math.max(0,weekMinutes-2100);
 overtimeValue.textContent=fmt(weekMinutes);
 overtimeStrip.classList.toggle('over-limit',extra>0);
 overtimeExtra.hidden=extra===0;overtimeExtra.textContent=extra?'+'+fmt(extra)+' d’heures sup':'';
 overtimeNote.textContent='Semaine affichée · base de 35 h';
}
function dayCard(day,index){
 const card=node('details',null,'week-card'),summary=node('summary'),heading=node('div',null,'card-heading');
 const d=new Date(week+'T12:00:00');d.setDate(d.getDate()+index);
 heading.append(node('strong',names[index]),node('span',d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})));
 const clients=node('p',day.length?[...new Set(day.map(item=>item.client||'Sans client'))].join(', '):'À remplir','card-clients');
 const issues=SheetReview.dayIssues(day),state=!day.length?'empty':issues.length?'check':'ok';
 const right=node('div',null,'card-right'),indicator=node('span',state==='empty'?'Vide':state==='check'?'À vérifier':'OK','card-state');indicator.dataset.state=state;
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
 const button=$('check-pdf');button.disabled=true;
 try{
  const file=new File([await weekBlob(true,{...payload,days:payload.days.slice(0,5)})],pdfFilename(payload),{type:'application/pdf'});
  if(share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Ma feuille de semaine'});$('status').textContent='Menu de partage fermé.';}catch(error){if(error.name==='AbortError')return;if(error.name!=='NotAllowedError')throw error;download(file,file.name);$('status').textContent='PDF téléchargé. Vous pouvez le joindre à votre message.';}}
  else{download(file,file.name);$('status').textContent='PDF téléchargé.';}
 }
 catch(error){$('status').textContent='Téléchargement impossible : '+error.message;}
 finally{button.disabled=false;}
}
async function reviewPdf(share=false){
 const payload=checkedPayload();if(!payload)return;
 const issues=SheetReview.weekIssues(payload.days);
 if(!issues.length){await downloadChecked(payload,share);return;}
 pendingReview=payload;pendingShare=share;$('review-download').textContent=share?'Continuer le partage':'Télécharger quand même';$('review-list').replaceChildren(...issues.map(issue=>node('li',issue.message)));$('review-dialog').showModal();
}
$('check-pdf').onclick=()=>reviewPdf();
$('share-pdf').onclick=()=>{if($('settings-dialog').open)$('settings-dialog').close();return reviewPdf(true);};
for(const id of ['review-close','review-fix'])$(id).onclick=()=>{$('review-dialog').close();pendingReview=null;};
$('review-download').onclick=async()=>{const payload=pendingReview,share=pendingShare;pendingReview=null;pendingShare=false;$('review-dialog').close();if(payload)await downloadChecked(payload,share);};
$('review-dialog').addEventListener('cancel',()=>{pendingReview=null;});
$('settings-dialog').prepend($('application').querySelector('.account-bar'));
$('settings-dialog').append($('mark-sent'),$('share-pdf'),$('export-ods'));
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
const weekendButton=node('button','Ajouter une intervention le week-end');weekendButton.type='button';$('settings-dialog').append(weekendButton);
const weekendDialog=node('dialog'),weekendTitle=node('h2','Intervention le week-end'),weekendForm=node('form'),weekendDate=document.createElement('input'),weekendLabel=node('label','Date de l’intervention');
weekendDate.type='date';weekendDate.required=true;weekendLabel.append(weekendDate);const weekendActions=node('div',null,'review-actions'),weekendCancel=node('button','Annuler'),weekendNext=node('button','Continuer','primary'),weekendError=node('p');weekendError.setAttribute('role','alert');weekendCancel.type='button';weekendNext.type='submit';weekendActions.append(weekendCancel,weekendNext);weekendForm.append(weekendLabel,weekendError,weekendActions);weekendDialog.append(weekendTitle,weekendForm);document.body.append(weekendDialog);
weekendButton.onclick=()=>{$('settings-dialog').close();const date=new Date(week+'T12:00:00');date.setDate(date.getDate()+5);weekendDate.value=iso(date);weekendError.textContent='';weekendDialog.showModal();};weekendCancel.onclick=()=>weekendDialog.close();
weekendForm.onsubmit=event=>{event.preventDefault();const date=weekendDate.value,index=(new Date(date+'T12:00:00').getDay()+6)%7;if(index<5){weekendError.textContent='Choisissez un samedi ou un dimanche.';return;}week=monday(date);selected=index;if(days()[index].length>=8){weekendError.textContent='Cette journée contient déjà huit lignes.';return;}weekendDialog.close();expandedDay=index;render();openEditor();};
// In the daily editor, less common actions live behind one disclosure.
const choices=dayPanel.querySelector('.day-more');choices.querySelector('summary').textContent='Autres choix';choices.querySelector('.day-tools').prepend($('workshop-day'));
$('previous-day').hidden=true;$('next-day').hidden=true;
async function deliveryStatus(){
 try{const data=await api('/api/delivery');$('delivery-status').textContent=data.connected?'Gmail et Drive connectés.':data.configured?'Connectez votre compte Google.':'Envoi désactivé : la connexion Google doit être configurée sur Cloudflare.';$('connect-google').disabled=!data.configured;
  const config=data.settings||{};$('delivery-to').value=config.to||'';$('delivery-copy').value=config.copy||'';$('delivery-time').value=config.time||'17:00';$('delivery-enabled').checked=!!config.enabled;
  if(data.last)$('delivery-message').textContent=data.last.message||data.last.status;
 }catch{$('delivery-status').textContent='Connexion nécessaire pour régler les envois.';}
}
const originalSettings=openSettings;openSettings=function(){originalSettings();deliveryStatus();};$('settings-open').onclick=openSettings;
$('connect-google').onclick=async()=>{try{const result=await api('/api/google/start',{});location.assign(result.url);}catch(error){$('delivery-message').textContent=error.message;}};
$('delivery-form').onsubmit=async event=>{event.preventDefault();try{const result=await api('/api/delivery',{to:$('delivery-to').value,copy:$('delivery-copy').value,time:$('delivery-time').value,enabled:$('delivery-enabled').checked});$('delivery-message').textContent=result.message;}catch(error){$('delivery-message').textContent=error.message;}};
