'use strict';
let currentView='day';
const viewTitles={day:['Ma journée','Choisissez le jour, puis ajoutez votre travail.'],weeks:['Mes semaines','Retrouvez votre feuille et partagez-la avec la secrétaire.'],month:['Mon bilan','Vos heures du mois et votre bloc-notes, au même endroit.']};
function setView(view){
 currentView=view;
 for(const key of Object.keys(viewTitles))$('view-'+key).hidden=key!==view;
 for(const button of document.querySelectorAll('#app-tabs button')){if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 $('screen-title').replaceChildren(document.createTextNode(viewTitles[view][0]),node('span','.'));$('screen-help').textContent=viewTitles[view][1];
}
for(const button of document.querySelectorAll('#app-tabs button'))button.onclick=()=>{setView(button.dataset.view);render();window.scrollTo({top:$('application').offsetTop-12,behavior:'auto'});};
$('day-picker').onchange=()=>{const value=$('day-picker').value;if(!value)return;week=monday(value);selected=Math.min(4,(new Date(value+'T12:00:00').getDay()+6)%7);render();};
$('today').onclick=()=>{const date=new Date();week=monday(iso(date));selected=Math.min(4,(date.getDay()+6)%7);render();};
function openSettings(){$('settings-dialog').showModal();}
$('settings-open').onclick=openSettings;$('settings-close').onclick=()=>$('settings-dialog').close();
$('month').value=iso(new Date()).slice(0,7);$('month').onchange=()=>renderMonth();
function notebookText(){
 const month=$('month').value,report=Timesheet.monthSummary(store,month);
 const date=new Date(month+'-01T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
 return [`BILAN — ${date}`,`Heures travaillées : ${fmt(report.worked)}`,`Au-delà de 35 h par semaine : ${fmt(report.overtime)}`,`École confirmée : ${fmt(report.school)}`,`Récupération prise ou prévue dans le mois : ${fmt(report.recovery)}`,`Congés : ${report.leave} jour(s)`,`Arrêts maladie : ${report.sick} jour(s)`,'','DÉTAIL HEBDOMADAIRE — MOIS DE FIN DE SEMAINE',...report.lines.map(line=>`Semaine du ${new Date(line.week+'T12:00:00').toLocaleDateString('fr-FR')} : + ${fmt(line.minutes)} (${line.school?'école confirmée':'heures saisies'} : ${fmt(line.total)})`),...(!report.lines.length?['Aucune heure supplémentaire enregistrée ce mois-ci.']:[])].join('\n');
}
function renderMonth(){
 if(!$('month').value)return;
 const report=Timesheet.monthSummary(store,$('month').value);
 $('month-worked').textContent=fmt(report.worked);$('month-overtime').textContent=fmt(report.overtime);$('month-leave').textContent=report.leave+' j';$('month-sick').textContent=report.sick+' j';$('month-school-hours').hidden=!report.school;$('month-school-hours').textContent=`École confirmée : ${fmt(report.school)} sur les semaines rattachées à ce mois. Déclaration hebdomadaire, distincte des horaires journaliers saisis.`;
 $('overtime-notebook').value=notebookText();if(document.activeElement!==$('month-notes'))$('month-notes').value=store.monthNotes[$('month').value]||'';
}
$('month-notes').oninput=()=>{store.monthNotes[$('month').value]=$('month-notes').value;save();};
$('download-notes').onclick=()=>{const notes=store.monthNotes[$('month').value]||'';download(new Blob([notebookText()+(notes?'\n\nMES NOTES\n'+notes:'')],{type:'text/plain;charset=utf-8'}),`bloc-notes-${$('month').value}.txt`);};
function renderWorkspace(){
 Timesheet.extras(store);$('day-picker').value=selectedDate();renderMonth();
 const status=Timesheet.sentStatus(store,week);$('week-state').textContent=status;$('week-state').dataset.sent=String(status==='Envoyée');
 $('mark-sent').textContent=status==='Envoyée'?'Annuler le statut envoyée':'Marquer comme envoyée';$('mark-sent').disabled=!days().some(day=>day.length);
 $('sent-help').textContent=status==='À renvoyer'?'Cette feuille a été modifiée après son envoi : pensez à la renvoyer.':'Le statut d’envoi est renseigné par vous. Le partage n’envoie pas automatiquement un mail.';
 $('friday-enabled').checked=store.preferences.fridayReminder!==false;renderReminder();renderRecovery();setView(currentView);
}
function renderReminder(now=new Date()){
 const key=monday(iso(now));$('friday-reminder').hidden=store.preferences.fridayReminder===false||now.getDay()!==5||!store.weeks[key]?.some(day=>day.length)||Timesheet.sentStatus(store,key)==='Envoyée';
}
$('reminder-week').onclick=()=>{week=monday(iso(new Date()));setView('weeks');render();};
$('friday-enabled').onchange=()=>{store.preferences.fridayReminder=$('friday-enabled').checked;save();renderReminder();};
$('mark-sent').onclick=()=>{
 if(Timesheet.sentStatus(store,week)==='Envoyée'){if(!confirm('Retirer le statut « envoyée » de cette semaine ?'))return;delete store.weekMeta[week];}
 else{if(!confirm('Confirmez-vous avoir envoyé cette feuille à la secrétaire ? Ce bouton n’envoie pas de mail.'))return;store.weekMeta[week]={sentAt:new Date().toISOString(),signature:Timesheet.signature(store.name,days())};}
 save();render();
};
let sharedFile=null,sharedSignature='';
$('share-pdf').onclick=async()=>{
 if(!store.name.trim()){openSettings();$('name').focus();$('status').textContent='Indiquez votre nom avant de partager la feuille.';return;}
 const payload=preparePdf();if(!payload)return;
 const button=$('share-pdf');button.disabled=true;
 try{
  const signature=payload.week+Timesheet.signature(payload.name,payload.days);
  if(!sharedFile||sharedSignature!==signature){sharedFile=new File([await weekBlob(true,payload)],pdfFilename(payload),{type:'application/pdf'});sharedSignature=signature;}
  if(navigator.canShare?.({files:[sharedFile]})){
   try{await navigator.share({files:[sharedFile],title:'Ma feuille de semaine'});$('status').textContent='Menu de partage fermé. Après l’envoi, vous pouvez marquer la feuille comme envoyée.';button.textContent='Partager le PDF';}
   catch(error){if(error.name==='AbortError')return;if(error.name==='NotAllowedError'){button.textContent='Partager le PDF prêt';$('status').textContent='PDF prêt : appuyez à nouveau sur Partager pour choisir votre application.';return;}throw error;}
  }else{download(sharedFile,sharedFile.name);$('status').textContent='Le PDF est téléchargé. Votre navigateur ne permet pas le partage direct : joignez-le à votre mail.';}
 }catch(error){$('status').textContent='Partage impossible : '+error.message;}finally{button.disabled=false;}
};
function renderFavoriteChoices(){
 $('favorite-choice-label').hidden=!store.favorites.length;
 const empty=node('option','Choisir un favori…');empty.value='';$('favorite-choice').replaceChildren(empty,...store.favorites.map(f=>{const option=node('option',`${f.client}${f.city?' · '+f.city:''} · ${f.travel} min de trajet`);option.value=f.id;return option;}));
}
$('favorite-choice').onchange=()=>{const favorite=store.favorites.find(f=>f.id===$('favorite-choice').value);if(!favorite)return;for(const key of ['client','city','travel'])$('form').elements[key].value=favorite[key];};
function rememberFavoriteItem(item){
 if(!item.client.trim())throw Error('Indiquez un client pour mémoriser ce favori.');
 const found=store.favorites.find(f=>f.client===item.client&&f.city===item.city);
 if(found){found.travel=item.travel;return;}
 if(store.favorites.length>=100)throw Error('Vous avez déjà 100 favoris. Supprimez-en un dans les réglages.');
 store.favorites.push({id:crypto.randomUUID(),client:item.client,city:item.city,travel:item.travel});
}
function renderFavorites(){
 $('favorites-list').replaceChildren();
 if(!store.favorites.length)$('favorites-list').append(node('p','Aucun favori pour le moment. Ajoutez votre premier chantier ci-dessous.','hint'));
 for(const f of store.favorites){const row=node('div',null,'favorite-row'),info=node('div');info.append(node('strong',f.client),node('p',`${f.city||'Localité non renseignée'} · trajet ${f.travel} min`));const remove=node('button','Retirer');remove.onclick=()=>{if(!confirm('Retirer ce chantier des favoris ?'))return;store.favorites=store.favorites.filter(item=>item.id!==f.id);save();renderFavorites();};row.append(info,remove);$('favorites-list').append(row);}
}
$('favorites-open').onclick=()=>{renderFavorites();$('favorite-error').textContent='';$('favorites-dialog').showModal();};$('favorites-close').onclick=()=>$('favorites-dialog').close();
$('favorite-form').onsubmit=event=>{event.preventDefault();try{const f=$('favorite-form').elements;rememberFavoriteItem({client:f.client.value.trim(),city:f.city.value.trim(),travel:Number(f.travel.value)});save();$('favorite-form').reset();renderFavorites();}catch(error){$('favorite-error').textContent=error.message;}};
function mergeImported(current,incoming){
 return checkStore({...current,...incoming,name:incoming.name||current.name,weeks:{...current.weeks,...incoming.weeks},weekMeta:{...current.weekMeta,...incoming.weekMeta},monthNotes:{...current.monthNotes,...incoming.monthNotes},favorites:[...new Map([...current.favorites,...incoming.favorites].map(f=>[f.id,f])).values()],preferences:{...current.preferences,...incoming.preferences},schoolDates:{...current.schoolDates,...incoming.schoolDates},recovery:{...current.recovery,...incoming.recovery,weeks:{...current.recovery.weeks,...incoming.recovery.weeks}}});
}
$('calendar-reminder').onclick=()=>{
 const start=new Date();start.setHours(17,0,0,0);start.setDate(start.getDate()+(5-start.getDay()+7)%7);if(start<new Date())start.setDate(start.getDate()+7);
 const date=iso(start).replaceAll('-','')+'T170000';
 const calendar=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ASC//Feuille de semaine//FR','CALSCALE:GREGORIAN','BEGIN:VTIMEZONE','TZID:Europe/Paris','BEGIN:DAYLIGHT','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','END:DAYLIGHT','BEGIN:STANDARD','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','END:STANDARD','END:VTIMEZONE','BEGIN:VEVENT','UID:asc-weekly-reminder@'+location.hostname,'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;TZID=Europe/Paris:'+date,'DURATION:PT15M','RRULE:FREQ=WEEKLY;BYDAY=FR','SUMMARY:Envoyer ma feuille de semaine','DESCRIPTION:Compléter la feuille ASC et envoyer le PDF à la secrétaire.','BEGIN:VALARM','TRIGGER:PT0S','ACTION:DISPLAY','DESCRIPTION:Penser à envoyer la feuille de semaine','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
 const folded=calendar.split('\r\n').map(line=>{let out='',length=0;for(const character of line){const size=new TextEncoder().encode(character).length;if(length+size>73){out+='\r\n ';length=1;}out+=character;length+=size;}return out;}).join('\r\n');
 download(new Blob([folded],{type:'text/calendar;charset=utf-8'}),'rappel-feuille-vendredi.ics');$('offline-help').textContent='Ouvrez le fichier calendrier téléchargé et confirmez son import pour recevoir le rappel chaque vendredi à 17 h (heure de Paris).';
};
