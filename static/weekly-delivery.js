'use strict';
const weeklyDeliveryDialog=node('dialog',null,'weekly-delivery'),weeklyDeliveryTitle=node('h2','Vérifier avant d’envoyer'),weeklyDeliveryClose=node('button','✕'),weeklyDeliveryHeader=node('div',null,'dialog-title'),weeklyDeliveryContent=node('div'),weeklyDeliveryStatus=node('p',null,'delivery-feedback'),weeklyDeliverySend=node('button','OK, envoyer à Suzie','primary'),weeklyDeliveryCancel=node('button','Annuler'),weeklyDeliveryConnect=node('button','Connecter mon compte Google'),weeklyDeliveryActions=node('div',null,'delivery-confirm-actions');
weeklyDeliveryDialog.id='weekly-delivery-dialog';weeklyDeliveryTitle.id='weekly-delivery-title';weeklyDeliveryDialog.setAttribute('aria-labelledby',weeklyDeliveryTitle.id);weeklyDeliveryClose.setAttribute('aria-label','Fermer');weeklyDeliveryStatus.setAttribute('role','status');
for(const button of [weeklyDeliveryClose,weeklyDeliverySend,weeklyDeliveryCancel,weeklyDeliveryConnect])button.type='button';
weeklyDeliverySend.id='weekly-delivery-send';weeklyDeliveryConnect.id='weekly-delivery-connect';weeklyDeliveryStatus.id='weekly-delivery-status';weeklyDeliveryContent.id='weekly-delivery-content';
weeklyDeliveryHeader.append(weeklyDeliveryTitle,weeklyDeliveryClose);weeklyDeliveryActions.append(weeklyDeliveryCancel,weeklyDeliveryConnect,weeklyDeliverySend);weeklyDeliveryDialog.append(weeklyDeliveryHeader,weeklyDeliveryContent,weeklyDeliveryStatus,weeklyDeliveryActions);document.body.append(weeklyDeliveryDialog);
let weeklyDeliveryDraft=null,weeklyDeliverySending=false,weeklyDeliveryGeneration=0;
function closeWeeklyDelivery(){if(weeklyDeliverySending)return;weeklyDeliveryGeneration++;weeklyDeliveryDialog.close();weeklyDeliveryDraft=null;}
weeklyDeliveryClose.onclick=weeklyDeliveryCancel.onclick=closeWeeklyDelivery;
weeklyDeliveryDialog.addEventListener('cancel',event=>{event.preventDefault();closeWeeklyDelivery();});
function deliveryEnvelopeLine(label,value){const row=node('p',null,'delivery-envelope-line');row.append(node('strong',label+' '),node('span',value));return row;}
async function openWeeklyDelivery(supplied){
 const payload=supplied||checkedPayload();if(!payload)return;
 const generation=++weeklyDeliveryGeneration;
 weeklyDeliveryDraft=null;weeklyDeliverySend.disabled=true;weeklyDeliverySend.hidden=false;weeklyDeliverySend.textContent='OK, envoyer à Suzie';weeklyDeliveryConnect.hidden=true;weeklyDeliveryConnect.disabled=false;weeklyDeliveryCancel.textContent='Annuler';weeklyDeliveryTitle.textContent='Vérifier avant d’envoyer';weeklyDeliveryStatus.textContent='Préparation du PDF joint…';weeklyDeliveryContent.replaceChildren();
 if(!weeklyDeliveryDialog.open)weeklyDeliveryDialog.showModal();
 try{
  const preview=await api('/api/delivery/prepare',{name:payload.name,week:payload.week,days:payload.days.slice(0,5)});
  if(generation!==weeklyDeliveryGeneration||!weeklyDeliveryDialog.open)return;
  const summary=node('section',null,'delivery-week-summary'),total=preview.days.reduce((n,day)=>n+daySum(day),0);
  summary.append(node('p',preview.subject,'delivery-week-label'),node('strong',fmt(total),'delivery-week-total'));
  preview.days.forEach((day,index)=>{
   const date=new Date(payload.week+'T12:00:00');date.setDate(date.getDate()+index);
   const row=node('div',null,'delivery-day'),heading=node('div',null,'delivery-day-heading');heading.append(node('strong',names[index]+' '+date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})),node('strong',fmt(daySum(day))));row.append(heading);
   if(!day.length)row.append(node('p','Journée vide','hint'));
   for(const item of day)row.append(node('p',(item.client||'Temps pour l’entreprise')+' · '+fmt(sum(item))));summary.append(row);
  });
  const envelope=node('section',null,'delivery-envelope');envelope.append(deliveryEnvelopeLine('À :','Suzie · '+preview.to),deliveryEnvelopeLine('De :',preview.from||'Compte Google à connecter'),deliveryEnvelopeLine('Objet :',preview.subject),node('p',preview.body,'delivery-mail-body'));
  const attachment=node('a','Vérifier le PDF joint ↗','delivery-attachment');attachment.id='weekly-delivery-preview';attachment.href='/api/delivery/preview?id='+encodeURIComponent(preview.id);attachment.target='_blank';attachment.rel='noopener';envelope.append(attachment,node('p',preview.filename,'hint'));
  weeklyDeliveryContent.append(summary,envelope);
  if(preview.issues.length){const warning=node('section',null,'delivery-warning');warning.append(node('strong','À vérifier'));for(const issue of preview.issues)warning.append(node('p',issue.message));weeklyDeliveryContent.append(warning);}
  let weekendCheck=null;
  if(payload.days.slice(5).some(day=>day.length)){
   const label=node('label',null,'delivery-weekend-check');weekendCheck=node('input');weekendCheck.type='checkbox';weekendCheck.id='weekly-delivery-weekend';label.append(weekendCheck,node('span','Le samedi et le dimanche sont exclus de cette feuille. Je confirme cet envoi du lundi au vendredi.'));weeklyDeliveryContent.append(label);
  }
  weeklyDeliveryDraft={...preview,week:payload.week,signature:Timesheet.signature(payload.name,[...preview.days,[],[]])};
  const uncertain=['preparing','sending','error'].includes(preview.previousStatus);
  const ready=preview.connected&&preview.configured&&!preview.alreadySent&&!uncertain;
  weeklyDeliverySend.disabled=!ready||!!weekendCheck;
  if(weekendCheck)weekendCheck.onchange=()=>{weeklyDeliverySend.disabled=!ready||!weekendCheck.checked;};
  if(preview.alreadySent){weeklyDeliveryStatus.textContent='Cette feuille a déjà été envoyée. Aucun nouvel envoi ne sera effectué.';weeklyDeliverySend.hidden=true;weeklyDeliveryCancel.textContent='Fermer';}
  else if(uncertain){weeklyDeliveryStatus.textContent=preview.previousMessage||'Un envoi est en cours ou reste à vérifier dans Gmail.';weeklyDeliverySend.hidden=true;}
  else if(!preview.configured){weeklyDeliveryStatus.textContent='Le PDF est prêt. L’envoi direct nécessite encore l’activation de la connexion Google pour cette application.';}
  else if(!preview.connected){weeklyDeliveryStatus.textContent='Connecte ton compte Google une première fois, puis rouvre cette fenêtre pour confirmer l’envoi.';weeklyDeliveryConnect.hidden=false;}
  else weeklyDeliveryStatus.textContent=preview.previousStatus==='sent'?'Une version précédente a été envoyée. OK enverra cette version corrigée à Suzie.':'Ce bouton n’envoie rien avant ton OK. Le PDF vérifié sera joint automatiquement.'+(preview.scheduled?' L’envoi programmé du vendredi reste activé.':'');
 }catch(error){if(generation===weeklyDeliveryGeneration){weeklyDeliveryStatus.textContent='Préparation impossible : '+error.message;weeklyDeliverySend.disabled=true;}}
}
weeklyDeliveryConnect.onclick=async()=>{
 weeklyDeliveryConnect.disabled=true;
 try{const result=await api('/api/google/start',{});location.assign(result.url);}catch(error){weeklyDeliveryStatus.textContent=error.message;weeklyDeliveryConnect.disabled=false;}
};
weeklyDeliverySend.onclick=async()=>{
 if(weeklyDeliverySending||weeklyDeliverySend.disabled||!weeklyDeliveryDraft)return;
 const draft=weeklyDeliveryDraft;weeklyDeliverySending=true;weeklyDeliverySend.disabled=true;weeklyDeliveryCancel.disabled=true;weeklyDeliveryClose.disabled=true;weeklyDeliveryStatus.textContent='Envoi à Suzie en cours…';
 try{
  const result=await api('/api/delivery/confirm',{id:draft.id,confirm:true});
  if(!result.sent)throw Error('Confirmation d’envoi manquante.');
  weeklyDeliveryTitle.textContent='Feuille envoyée ✓';weeklyDeliveryStatus.textContent=result.message;weeklyDeliverySend.hidden=true;weeklyDeliveryCancel.textContent='Fermer';
  // Record exactly the reviewed version. Later edits continue to show “À renvoyer”.
  store.weekMeta[draft.week]={sentAt:new Date().toISOString(),signature:draft.signature};save();render();
 }catch(error){
  weeklyDeliveryStatus.textContent='Envoi non confirmé : '+error.message+' Ferme puis rouvre cette fenêtre pour vérifier son état.';
  // A lost response can hide a successful send; never offer an unguarded retry.
 }finally{weeklyDeliverySending=false;weeklyDeliveryCancel.disabled=false;weeklyDeliveryClose.disabled=false;}
};
