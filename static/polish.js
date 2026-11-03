'use strict';
// Keep the selected week in this tab when refreshing, without storing any work data here.
try{const view=JSON.parse(sessionStorage.getItem('asc-view-v1'));if(view&&/^\d{4}-\d{2}-\d{2}$/.test(view.week)&&Number.isFinite(Date.parse(view.week+'T12:00:00'))&&monday(view.week)===view.week&&Number.isInteger(view.selected)&&view.selected>=0&&view.selected<7){week=view.week;selected=view.selected;expandedDay=view.expanded===view.selected?view.selected:null;}}catch{}
// Presentation and navigation reuse the existing calculations and storage.
function makeUiIcon(name){
 const paths={week:'M5 4h14a1 1 0 0 1 1 1v15H4V5a1 1 0 0 1 1-1Zm3-2v4m8-4v4M4 9h16M8 13h3m-3 4h7',calendar:'M5 4h14a1 1 0 0 1 1 1v15H4V5a1 1 0 0 1 1-1Zm3-2v4m8-4v4M4 9h16M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01',chart:'M4 3v17h17M8 15v-4m5 4V7m5 8v-6',settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm6 9a3 3 0 1 0-6 0 3 3 0 0 0 6 0',refresh:'M20 8a8 8 0 1 0 0 8M20 3v5h-5'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[name]);svg.append(path);return svg;
}
for(const [id,icon] of [['refresh-app','refresh'],['settings-open','settings']])$(id).replaceChildren(makeUiIcon(icon));

const weekContext=node('div',null,'week-context'),weekEyebrow=node('p','MON CARNET DE SEMAINE'),currentWeekButton=node('button','Cette semaine');
currentWeekButton.type='button';currentWeekButton.id='go-current-week';weekContext.append(weekEyebrow,currentWeekButton);$('simple-home').prepend(weekContext);
currentWeekButton.onclick=()=>{week=monday(iso(new Date()));selected=Math.min(4,(new Date().getDay()+6)%7);expandedDay=null;render();window.scrollTo({top:0,behavior:'auto'});};
const stateButton=node('button',null,'connection-indicator'),stateDot=node('span',null,'connection-dot'),stateCaption=node('span','Connexion…');stateButton.id='connection-indicator';stateButton.type='button';stateCaption.setAttribute('role','status');stateButton.append(stateDot,stateCaption);weekContext.append(stateButton);
stateButton.onclick=()=>{openSettings();$('settings-more').open=true;$('settings-backups').open=true;$('settings-backups').scrollIntoView({block:'nearest'});};
function updateConnectionStatus(message,error=false){
 let label='À jour',state='ready';
 if(error||conflicting){label='À vérifier';state='error';}
 else if(!navigator.onLine||/Hors connexion/i.test(message)){label='Hors connexion';state='offline';}
 else if(!connected){label='Connexion requise';state='offline';}
 else if(dirty){label=cacheSaved?'Sur cet appareil':'Enregistrement…';state='saving';}
 if(stateCaption.textContent!==label)stateCaption.textContent=label;
 stateButton.dataset.state=state;stateButton.title=message;stateButton.setAttribute('aria-label',label+' · '+message+' · Voir la sauvegarde');
}

// Put the useful weekly information before the day list.
$('week-cards').before(overtimeStrip);
const weekProgress=node('div',null,'week-progress'),weekProgressFill=node('span'),weekCompleted=node('p',null,'week-completed');
weekProgress.id='weekly-progress';weekProgress.setAttribute('role','progressbar');weekProgress.setAttribute('aria-label','Heures saisies sur un objectif de 35 heures');weekProgress.setAttribute('aria-valuemin','0');weekProgress.setAttribute('aria-valuemax','2100');weekProgress.append(weekProgressFill);overtimeStrip.insertBefore(weekProgress,overtimeLink);overtimeStrip.insertBefore(weekCompleted,overtimeLink);
function isoWeekNumber(value){const d=new Date(Date.UTC(value.getFullYear(),value.getMonth(),value.getDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));return Math.ceil((((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000)+1)/7);}
function renderPolishedHome(){
 try{sessionStorage.setItem('asc-view-v1',JSON.stringify({week,selected,expanded:expandedDay}));}catch{}
 const from=new Date(week+'T12:00:00'),to=new Date(from);to.setDate(to.getDate()+4);
 $('simple-week').textContent=from.getMonth()===to.getMonth()?from.getDate()+' — '+to.toLocaleDateString('fr-FR',{day:'numeric',month:'long'}):from.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+' — '+to.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
 $('simple-year').textContent='Semaine '+isoWeekNumber(from)+' · '+(from.getFullYear()===to.getFullYear()?from.getFullYear():from.getFullYear()+' / '+to.getFullYear());
 currentWeekButton.hidden=week===monday(iso(new Date()));
 const total=days().reduce((n,day)=>n+daySum(day),0);weekProgressFill.style.width=Math.min(100,total/2100*100)+'%';weekProgress.setAttribute('aria-valuenow',String(Math.min(2100,total)));weekProgress.setAttribute('aria-valuetext',fmt(total)+' saisies sur 35 h');
 const completed=days().slice(0,5).filter((day,index)=>{const date=new Date(from);date.setDate(date.getDate()+index);return isDayCompleted(iso(date),day);}).length;
 weekCompleted.textContent=completed+' / 5 journées terminées';
 $('simple-home').querySelector('.download-bar').hidden=expandedDay!==null;
 repeatYesterday.textContent='Reprendre la veille';
 for(const button of document.querySelectorAll('#entries .edit-hours'))button.setAttribute('aria-label','Modifier les heures de cette intervention');
}

// Three clear destinations; the existing calendar button keeps its behavior.
const bottomDock=node('nav',null,'bottom-dock'),dockWeek=node('button'),dockMonth=node('button');bottomDock.setAttribute('aria-label','Navigation principale');dockWeek.id='nav-week';dockMonth.id='nav-bilan';dockWeek.type=dockMonth.type='button';
for(const [button,icon,label] of [[dockWeek,'week','Semaine'],[calendarButton,'calendar','Calendrier'],[dockMonth,'chart','Bilan']]){button.className='dock-item';button.replaceChildren(makeUiIcon(icon),node('span',label));bottomDock.append(button);}
$('application').append(bottomDock);dockWeek.onclick=currentWeekButton.onclick;dockMonth.onclick=openMonth;
function updateDock(){for(const [button,active] of [[dockWeek,!calendarDialog.open&&!$('month-dialog').open],[calendarButton,calendarDialog.open],[dockMonth,$('month-dialog').open]]){if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}}
for(const dialog of [calendarDialog,$('month-dialog')])new MutationObserver(updateDock).observe(dialog,{attributes:true,attributeFilter:['open']});updateDock();

// Optional bon numbers never compete with the apprentice's main inputs.
const optionalBons=node('details',null,'optional-bons');optionalBons.append(node('summary','Numéros de bon · facultatif'));const bonFields=$('client-fields').querySelector('.bon-fields');bonFields.before(optionalBons);optionalBons.append(bonFields);
const editorPages=[...$('form').querySelectorAll('.wizard-page')];
editorPages[0].querySelector('h3').textContent='Le lieu de travail';editorPages[2].querySelector('h3').textContent='Le temps sur place';
const durationHelp=node('p','Durées : 2h30, 2:30 ou 2h.','duration-help');editorPages[2].prepend(durationHelp);
function simplifyWorkplaceFields(){editorPages[2].hidden=isWorkshop();}
const polishedShowStep=showStep;showStep=function(){polishedShowStep();simplifyWorkplaceFields();};
const polishedWorkplace=updateWorkplace;updateWorkplace=function(){polishedWorkplace();simplifyWorkplaceFields();};

let editorBaseline='';
const formFingerprint=form=>JSON.stringify([...new FormData(form)]);
const polishedOpenEditor=openEditor;
openEditor=function(index=-1){polishedOpenEditor(index);if(index<0&&store.schoolDates[selectedDate()]&&!days()[selected].length){$('workplace').value='school';updateWorkplace();}optionalBons.open=false;editorBaseline=formFingerprint($('form'));};
function hasPendingEdits(){
 return ($('editor').open&&formFingerprint($('form'))!==editorBaseline)||[...document.querySelectorAll('.quick-hours')].some(form=>formFingerprint(form)!==form.dataset.initial);
}
function confirmDiscardEdits(){
 if(!hasPendingEdits())return true;
 if(!confirm('Des modifications ne sont pas enregistrées. Quitter sans les enregistrer ?'))return false;
 if($('editor').open)$('editor').close();document.querySelectorAll('.quick-hours').forEach(form=>form.remove());return true;
}
$('cancel').onclick=()=>{if(confirmDiscardEdits())$('editor').close();};
$('editor').addEventListener('cancel',event=>{if(!confirmDiscardEdits())event.preventDefault();});
$('editor').addEventListener('close',()=>{if(!hasPendingEdits())render();});
document.addEventListener('click',event=>{if(!document.querySelector('.quick-hours'))return;if(event.target.closest('.week-card>summary,#week-back,#week-forward,#go-current-week,#nav-week,#nav-bilan,#open-calendar,#settings-open,#add,#repeat-yesterday,#entries .actions button:not(:last-child),.quick-favorite-list button,#day-action-menu button')&&!confirmDiscardEdits()){event.preventDefault();event.stopImmediatePropagation();}},true);
window.addEventListener('beforeunload',event=>{if(hasPendingEdits()){event.preventDefault();event.returnValue='';}});

// Make history searchable without adding a new page.
const historySearch=node('input');historySearch.id='history-search';historySearch.type='search';historySearch.placeholder='Un mois, une date ou un client…';historySearch.setAttribute('aria-label','Rechercher une ancienne semaine');$('history-list').before(historySearch);
const searchText=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
renderHistory=function(){
 const query=searchText(historySearch.value.trim()),keys=Object.keys(store.weeks).filter(key=>store.weeks[key].some(day=>day.length)).sort().reverse();$('history-list').replaceChildren();
 for(const key of keys){const ds=store.weeks[key],date=new Date(key+'T12:00:00'),end=new Date(date);end.setDate(end.getDate()+4);const label=date.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});const clients=[...new Set(ds.flat().map(item=>item.client+' '+item.city))].join(' ');if(query&&!searchText(key+' '+label+' '+clients).includes(query))continue;
  const button=node('button',null,'history-card'),info=node('span'),state=node('span',Timesheet.sentStatus(store,key),'history-state');button.type='button';info.append(node('strong','Semaine du '+label),node('small',fmt(ds.reduce((n,day)=>n+daySum(day),0))+' · '+ds.filter(day=>day.length).length+' jours renseignés'));button.append(info,state);button.onclick=()=>{week=key;selected=0;expandedDay=null;setView('weeks');render();window.scrollTo({top:0,behavior:'auto'});};$('history-list').append(button);
 }
 if(!$('history-list').children.length)$('history-list').append(node('p',query?'Aucune semaine ne correspond à cette recherche.':'Vos semaines apparaîtront ici après vos premières saisies.','empty-state'));
};historySearch.oninput=renderHistory;
const historyOpen=$('open-history').onclick;$('open-history').onclick=()=>{historySearch.value='';historyOpen();};

// The monthly view starts with the selected month and its four useful figures.
const monthlyView=$('view-month'),monthToolbar=monthlyView.querySelector('.date-toolbar'),monthStats=monthlyView.querySelector('.month-stats'),recoveryPanel=monthlyView.querySelector('.recovery-panel');
monthlyView.prepend(monthToolbar,monthStats);
for(const [tile,label] of [...monthStats.children].map((tile,index)=>[tile,['HEURES SAISIES','HEURES SUP','CONGÉS','MALADIE'][index]]))tile.querySelector('small').textContent=label;
const monthExplanation=node('details',null,'bilan-disclosure');monthExplanation.append(node('summary','Comprendre le calcul du mois'));const calculationHint=[...monthlyView.children].find(item=>item.matches('p.hint')&&!item.id);if(calculationHint)monthExplanation.append(calculationHint);monthStats.after(monthExplanation);
recoveryPanel.querySelector('h2').textContent='Ma récupération';
const recoveryOptions=node('details',null,'bilan-disclosure');recoveryOptions.append(node('summary','Détails et réglages du compteur'));
const recoveryWarning=$('recovery-warning');recoveryOptions.append(recoveryWarning,...recoveryPanel.querySelectorAll(':scope>details'));recoveryPanel.append(recoveryOptions);
const notebook=monthlyView.querySelector('.notebook');notebook.querySelector('h2').textContent='Mes notes du mois';notebook.querySelector('p').textContent='Le téléchargement rassemble vos heures et vos notes d’apprentissage.';
const notebookDetails=node('details',null,'bilan-disclosure');notebookDetails.append(node('summary','Voir le détail des heures'),$('overtime-notebook').parentElement);notebook.querySelector('h2').after(notebookDetails);
const monthPicker=node('span',null,'bilan-month-picker'),monthCaption=node('span');$('month').before(monthPicker);monthPicker.append(monthCaption,$('month'));
const polishedRenderMonth=renderMonth;renderMonth=function(){polishedRenderMonth();const value=$('month').value;if(/^\d{4}-\d{2}$/.test(value))monthCaption.textContent=new Date(value+'-01T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});};
const polishedMonthlyOncall=renderMonthlyOncall;renderMonthlyOncall=function(){polishedMonthlyOncall();const month=$('month').value;monthlyOncall.hidden=!Object.entries(store.weeks).some(([key,ds])=>ds.slice(5).some((day,index)=>{const date=new Date(key+'T12:00:00');date.setDate(date.getDate()+5+index);return iso(date).startsWith(month)&&day.some(item=>!isAbsence(item)&&sum(item)>0);}));};

// Keyboard navigation in the visual calendar follows real calendar dates.
const polishedCalendarRender=renderMonthCalendar;renderMonthCalendar=function(){polishedCalendarRender();const buttons=[...calendarGrid.querySelectorAll('button[data-date]')],preferred=buttons.find(button=>button.dataset.date===selectedDate())||buttons.find(button=>button.hasAttribute('aria-current'))||buttons[0];for(const button of buttons)button.tabIndex=button===preferred?0:-1;};
calendarGrid.addEventListener('focusin',event=>{const target=event.target.closest('button[data-date]');if(target)for(const button of calendarGrid.querySelectorAll('button[data-date]'))button.tabIndex=button===target?0:-1;});
calendarGrid.addEventListener('keydown',event=>{
 const button=event.target.closest('button[data-date]');if(!button)return;
 const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(offset===undefined)return;
 event.preventDefault();const date=new Date(button.dataset.date+'T12:00:00');date.setDate(date.getDate()+offset);const value=iso(date);if(value.slice(0,7)!==calendarMonth.value){calendarMonth.value=value.slice(0,7);renderMonthCalendar();}calendarGrid.querySelector('[data-date="'+value+'"]')?.focus();
});

const codeWrapper=node('span',null,'code-wrapper'),toggleCode=node('button','Afficher');toggleCode.id='toggle-code';toggleCode.type='button';toggleCode.setAttribute('aria-label','Afficher ou masquer le code');toggleCode.setAttribute('aria-pressed','false');$('access-code').before(codeWrapper);codeWrapper.append($('access-code'),toggleCode);toggleCode.onclick=()=>{const visible=$('access-code').type==='password';$('access-code').type=visible?'text':'password';toggleCode.setAttribute('aria-pressed',String(visible));toggleCode.textContent=visible?'Masquer':'Afficher';};
function tidyStatus(){const text=$('status').textContent;$('status').classList.toggle('routine-status',/^(Enregistrement…|Enregistré sur cet appareil\.|Enregistrement et actualisation…)$/.test(text));}
new MutationObserver(tidyStatus).observe($('status'),{childList:true,characterData:true,subtree:true});tidyStatus();
