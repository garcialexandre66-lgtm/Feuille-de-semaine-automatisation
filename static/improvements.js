'use strict';
// Daily helpers stay inside the expanded day; less common tools stay folded.
const cloneDay=day=>JSON.parse(JSON.stringify(day));
const dayFingerprint=day=>Timesheet.signature('',day);
function isDayCompleted(date,day){return !!day.length&&store.completedDays?.[date]===dayFingerprint(day);}

let lastDeletion=null;
const undoBar=node('div',null,'undo-bar'),undoMessage=node('span'),undoButton=node('button','Annuler'),undoDismiss=node('button','✕');
undoBar.id='undo-deletion';undoBar.hidden=true;undoMessage.setAttribute('role','status');undoButton.type=undoDismiss.type='button';undoButton.id='undo-deletion-button';undoDismiss.setAttribute('aria-label','Fermer l’annulation');
undoBar.append(undoMessage,undoButton,undoDismiss);document.body.append(undoBar);
function clearUndo(){lastDeletion=null;undoBar.hidden=true;}
undoDismiss.onclick=clearUndo;
$('logout').addEventListener('click',clearUndo);
function deleteEntry(index){
 if(!confirm('Supprimer cette intervention ?'))return;
 const before=cloneDay(days()[selected]);
 days()[selected].splice(index,1);
 lastDeletion={week,index:selected,before,after:dayFingerprint(days()[selected])};
 save();render();undoMessage.textContent='Intervention supprimée.';undoBar.hidden=false;
}
undoButton.onclick=()=>{
 if(!lastDeletion)return;
 if(lastDeletion.kind==='task'){
  const item=lastDeletion,tasks=store.dayTasks[item.date];
  if(!tasks||tasks[item.id]){undoMessage.textContent='Cette tâche a changé. Son état actuel est conservé.';return;}
  tasks[item.id]={...item.task};clearUndo();save();render();$('status').textContent='Tâche restaurée.';return;
 }
 const item=lastDeletion,current=store.weeks[item.week]?.[item.index];
 if(!current||dayFingerprint(current)!==item.after){undoMessage.textContent='Cette journée a changé. Annulation impossible sans écraser les nouvelles saisies.';return;}
 store.weeks[item.week][item.index]=cloneDay(item.before);clearUndo();save();render();$('status').textContent='Intervention restaurée.';
};

function offerTaskUndo(date,id,task){lastDeletion={kind:'task',date,id,task:{...task}};undoMessage.textContent='Tâche retirée.';undoBar.hidden=false;}
function openQuickHours(index,article){
 document.querySelectorAll('.quick-hours').forEach(form=>form.remove());
 const key=week,dayIndex=selected,original=cloneDay(days()[selected]),item=original[index];
 const form=node('form',null,'quick-hours'),grid=node('div',null,'quick-hours-grid'),error=node('p'),actions=node('div',null,'quick-hours-actions');
 form.setAttribute('aria-label','Modifier les heures de '+(item.client||'cette intervention'));error.setAttribute('role','alert');
 const workshop=['atelier','school'].includes(item.workplace)||['Atelier ASC','École'].includes(item.client);
 const visible=workshop?['tpe']:fields;
 for(const field of visible){const label=node('label',field==='travel'?'Trajet':field==='tpe'?(item.workplace==='school'?'École':'Entreprise / atelier'):labels[fields.indexOf(field)]);const input=node('input');input.name=field;input.type='text';input.value=fmt(item[field]);input.required=true;input.maxLength=20;input.setAttribute('aria-label',label.textContent);label.append(input);grid.append(label);}
 const cancel=node('button','Annuler'),submit=node('button','Enregistrer les heures','primary');cancel.type='button';submit.type='submit';cancel.onclick=()=>{if(typeof confirmDiscardEdits!=='function'||confirmDiscardEdits()){form.remove();render();}};actions.append(cancel,submit);form.append(grid,error,actions);article.append(form);form.dataset.initial=JSON.stringify([...new FormData(form)]);form.querySelector('input').focus();
 form.onsubmit=event=>{
  event.preventDefault();try{
   if(dayFingerprint(store.weeks[key]?.[dayIndex]||[])!==dayFingerprint(original))throw Error('Cette journée a changé. Fermez et rouvrez les heures.');
   const updated=cloneDay(original),entry=updated[index];
   for(const field of visible){const value=parseDuration(form.elements[field].value);if(!Number.isInteger(value)||value<0||value>1440)throw Error('Chaque durée doit être comprise entre 0 et 24 h.');entry[field]=value;}
   if(!sum(entry))throw Error('Indiquez au moins une durée.');
   const candidate=JSON.parse(JSON.stringify(store));candidate.weeks[key][dayIndex]=updated;checkStore(candidate);
   store.weeks[key][dayIndex]=updated;save();render();showDayConfirmation(updated);
  }catch(problem){error.textContent=problem.message;}
 };
}

const dailyTools=node('section',null,'daily-tools'),completionLabel=node('label',null,'completion-label'),completionInput=node('input'),completionText=node('span','Journée terminée');
completionInput.type='checkbox';completionInput.id='day-completed';completionLabel.append(completionInput,completionText);
const quickFavorites=node('details',null,'daily-disclosure'),quickFavoriteList=node('div',null,'quick-favorite-list');
quickFavorites.id='quick-favorites';quickFavorites.append(node('summary','Mes chantiers favoris'),quickFavoriteList);
const learning=node('details',null,'daily-disclosure'),learningLabel=node('label'),learningInput=node('textarea'),learningHint=node('p','Enregistré automatiquement · visible dans le bilan mensuel.','hint');
learning.id='day-learning';learningInput.id='learning-note';learningInput.setAttribute('aria-label','Ce que j’ai appris');learningInput.rows=3;learningInput.maxLength=2000;learningInput.placeholder='Ex. : poser une prise, lire un schéma…';learningLabel.append(learningInput);learning.append(node('summary','Ce que j’ai appris'),learningLabel,learningHint);
dailyTools.append(completionLabel,quickFavorites,learning);dayPanel.querySelector('.day').append(dailyTools);
completionInput.onchange=()=>{const date=selectedDate();if(completionInput.checked&&days()[selected].length)store.completedDays[date]=dayFingerprint(days()[selected]);else delete store.completedDays[date];save();render();};
learningInput.oninput=()=>{const date=selectedDate();if(learningInput.value)store.learningNotes[date]=learningInput.value;else delete store.learningNotes[date];save();};
function renderDailyTools(){
 const day=days()[selected],date=selectedDate();
 completionInput.disabled=!day.length;completionInput.checked=isDayCompleted(date,day);
 if(document.activeElement!==learningInput)learningInput.value=store.learningNotes[date]||'';
 quickFavorites.hidden=!store.favorites.length;
 quickFavoriteList.replaceChildren(...store.favorites.map(favorite=>{
  const button=node('button',favorite.client+(favorite.city?' · '+favorite.city:''));button.type='button';button.disabled=day.some(isAbsence)||day.length>=8;
  button.onclick=()=>{openEditor();$('workplace').value='client';updateWorkplace();for(const field of ['client','city','travel'])$('form').elements[field].value=favorite[field];$('form').elements.chantier.focus();};return button;
 }));
}

const learningMonth=node('details',null,'daily-disclosure'),learningMonthList=node('div');learningMonth.id='month-learning';learningMonth.append(node('summary','Mes apprentissages du mois'),learningMonthList);$('view-month').append(learningMonth);
function learningText(month){
 return Object.entries(store.learningNotes||{}).filter(([date,note])=>date.startsWith(month+'-')&&note.trim()).sort(([a],[b])=>a.localeCompare(b)).map(([date,note])=>({date,note}));
}
const learningRenderMonth=renderMonth;
renderMonth=function(){
 learningRenderMonth();const notes=learningText($('month').value);learningMonthList.replaceChildren();
 if(!notes.length)learningMonthList.append(node('p','Aucune note d’apprentissage pour ce mois.','hint'));
 for(const {date,note} of notes){const article=node('article');article.append(node('strong',new Date(date+'T12:00:00').toLocaleDateString('fr-FR')),node('p',note));learningMonthList.append(article);}
};
const learningNotebookText=notebookText;
notebookText=function(){const notes=learningText($('month').value);return learningNotebookText()+(notes.length?'\n\nMES APPRENTISSAGES\n'+notes.map(({date,note})=>new Date(date+'T12:00:00').toLocaleDateString('fr-FR')+' : '+note).join('\n\n'):'');};

function renderPdfOverview(payload){
 const overview=$('review-overview'),workdays=payload.days.slice(0,5);overview.replaceChildren();
 const total=workdays.reduce((n,day)=>n+daySum(day),0),heading=node('p',null,'pdf-overview-total');heading.append(node('span','Total du PDF · lundi à vendredi'),node('strong',fmt(total)));overview.append(heading);
 const list=node('ul');
 workdays.forEach((day,index)=>{const row=node('li'),date=new Date(payload.week+'T12:00:00');date.setDate(date.getDate()+index);const label=names[index]+' '+date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});row.append(node('strong',label),node('span',day.length?[...new Set(day.map(item=>item.client||'Sans client'))].join(', '):'Vide'),node('strong',fmt(daySum(day))));list.append(row);});overview.append(list);
}
