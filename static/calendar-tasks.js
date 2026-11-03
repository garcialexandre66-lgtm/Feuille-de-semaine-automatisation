'use strict';
// Calendar dates navigate the existing week editor; no hours are created here.
const calendarButton=node('button','Calendrier du mois','calendar-shortcut');calendarButton.id='open-calendar';calendarButton.type='button';calendarButton.setAttribute('aria-haspopup','dialog');
$('simple-home').querySelector('.week-heading').after(calendarButton);
const calendarDialog=node('dialog',null,'month-calendar'),calendarHeading=node('div',null,'dialog-title'),calendarTitle=node('h2','Mon calendrier'),calendarClose=node('button','✕');
calendarDialog.id='calendar-dialog';calendarTitle.id='calendar-title';calendarDialog.setAttribute('aria-labelledby',calendarTitle.id);calendarClose.type='button';calendarClose.id='calendar-close';calendarClose.setAttribute('aria-label','Fermer le calendrier');calendarClose.onclick=()=>calendarDialog.close();calendarHeading.append(calendarTitle,calendarClose);
const calendarNavigation=node('div',null,'calendar-navigation'),calendarPrevious=node('button','‹'),calendarNext=node('button','›'),calendarMonth=node('input');
calendarPrevious.type=calendarNext.type='button';calendarPrevious.setAttribute('aria-label','Mois précédent');calendarNext.setAttribute('aria-label','Mois suivant');calendarMonth.type='month';calendarMonth.id='calendar-month';calendarMonth.setAttribute('aria-label','Mois du calendrier');
const calendarMonthPicker=node('label',null,'calendar-month-picker'),calendarMonthName=node('span');calendarMonthName.setAttribute('aria-hidden','true');calendarMonthPicker.append(calendarMonthName,calendarMonth);calendarNavigation.append(calendarPrevious,calendarMonthPicker,calendarNext);
const calendarWeekdays=node('div',null,'calendar-weekdays');calendarWeekdays.setAttribute('aria-hidden','true');for(const name of ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'])calendarWeekdays.append(node('span',name));
const calendarGrid=node('div',null,'calendar-grid');calendarGrid.id='calendar-days';calendarGrid.setAttribute('role','group');calendarGrid.setAttribute('aria-label','Jours du mois');
const calendarLegend=node('div',null,'calendar-legend');for(const [kind,label] of [['work','Travail'],['school','École'],['absence','Absence'],['empty','Vide']]){const item=node('span',label);item.dataset.kind=kind;calendarLegend.append(item);}
const calendarToday=node('button','Aujourd’hui','calendar-today');calendarToday.type='button';calendarToday.onclick=()=>{calendarMonth.value=iso(new Date()).slice(0,7);renderMonthCalendar();calendarGrid.querySelector('[aria-current="date"]')?.focus();};
calendarDialog.append(calendarHeading,calendarNavigation,calendarWeekdays,calendarGrid,calendarLegend,calendarToday);document.body.append(calendarDialog);
function renderMonthCalendar(){
 const month=calendarMonth.value;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
 const first=new Date(month+'-01T12:00:00'),next=new Date(first);next.setMonth(next.getMonth()+1);
 calendarMonthName.textContent=first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
 const cells=[];for(let i=0;i<(first.getDay()+6)%7;i++){const blank=node('span');blank.setAttribute('aria-hidden','true');cells.push(blank);}
 for(const date=new Date(first);date<next;date.setDate(date.getDate()+1)){
  const value=iso(date),key=monday(value),index=(date.getDay()+6)%7,day=store.weeks[key]?.[index]||[],total=daySum(day),absent=day.find(isAbsence),school=day.some(item=>item.workplace==='school'||item.client==='École')||(!day.length&&!!store.schoolDates[value]);
  const kind=absent?'absence':school?'school':total?'work':'empty',status=absent?absent.client:school?(total?fmt(total):'Prévue'):total?fmt(total):'';
  const button=node('button',null,'calendar-day');button.type='button';button.dataset.date=value;button.dataset.kind=kind;button.setAttribute('aria-pressed',String(value===selectedDate()));button.append(node('span',String(date.getDate()),'calendar-number'),node('span',status,'calendar-status'));
  const tasks=Object.values(store.dayTasks[value]||{}),remaining=tasks.filter(task=>!task.done).length;
  const completed=isDayCompleted(value,day);if(completed)button.append(node('span','✓','calendar-complete'));
  button.setAttribute('aria-label',date.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+' · '+(absent?absent.client:school?'École'+(!total?' prévue':''):total?'Travail':'Vide')+(total?' · '+fmt(total):'')+(completed?' · journée terminée':'')+(remaining?' · '+remaining+' tâche(s) à faire':''));
  if(value===iso(new Date()))button.setAttribute('aria-current','date');
  button.onclick=()=>{calendarDialog.close();week=key;selected=index;expandedDay=index;render();const card=document.querySelector('.week-card[data-day="'+index+'"]');card?.querySelector('summary')?.focus();card?.scrollIntoView({block:'start',behavior:'auto'});};cells.push(button);
 }
 calendarGrid.replaceChildren(...cells);
}
calendarButton.onclick=()=>{calendarMonth.value=selectedDate().slice(0,7);renderMonthCalendar();calendarDialog.showModal();};
function moveCalendarMonth(offset){const date=new Date(calendarMonth.value+'-01T12:00:00');if(!Number.isFinite(date.getTime()))return;date.setMonth(date.getMonth()+offset);calendarMonth.value=iso(date).slice(0,7);renderMonthCalendar();}
calendarPrevious.onclick=()=>moveCalendarMonth(-1);calendarNext.onclick=()=>moveCalendarMonth(1);calendarMonth.onchange=()=>{if(!calendarMonth.value)calendarMonth.value=selectedDate().slice(0,7);renderMonthCalendar();};

const defaultTasks=()=>({'default-tools':{text:'Outils récupérés',done:false},'default-clean':{text:'Chantier rangé',done:false},'default-checks':{text:'Vérifications faites',done:false}});
const todo=node('details',null,'daily-disclosure day-todo'),todoSummary=node('summary'),todoCount=node('span',null,'todo-count'),todoList=node('div',null,'todo-list'),todoForm=node('form',null,'todo-add'),todoInput=node('input'),todoAdd=node('button','Ajouter'),todoError=node('p');
todo.id='day-todo';todoSummary.append(node('span','Ma to-do list'),todoCount);todoList.id='todo-list';todoInput.type='text';todoInput.id='todo-new-task';todoInput.placeholder='Une tâche à ajouter…';todoInput.maxLength=200;todoInput.required=true;todoInput.setAttribute('aria-label','Nouvelle tâche');todoAdd.type='submit';todoError.setAttribute('role','alert');todoError.className='todo-error';todoForm.append(todoInput,todoAdd);todo.append(todoSummary,todoList,todoForm,todoError);dailyTools.insertBefore(todo,quickFavorites);
let todoDate='';
function savedTasks(date){return store.dayTasks[date]??defaultTasks();}
function editTasks(date){return store.dayTasks[date]??=defaultTasks();}
function renderDayTodo(){
 const date=selectedDate();if(todoDate!==date){todoDate=date;todoInput.value='';todoError.textContent='';todo.open=false;}
 const tasks=savedTasks(date),entries=Object.entries(tasks),done=entries.filter(([,task])=>task.done).length;
 todoCount.textContent=done+'/'+entries.length;todoCount.setAttribute('aria-label',done+' tâche(s) terminée(s) sur '+entries.length);todoInput.disabled=todoAdd.disabled=entries.length>=50;
 todoList.replaceChildren(...entries.map(([id,task])=>{
  const row=node('div',null,'todo-row'),label=node('label'),input=node('input'),text=node('span',task.text),remove=node('button','✕');input.type='checkbox';input.checked=task.done;input.dataset.task=id;label.append(input,text);remove.type='button';remove.setAttribute('aria-label','Retirer la tâche : '+task.text);row.dataset.done=String(task.done);
  input.onchange=()=>{editTasks(date)[id]={...task,done:input.checked};save();renderDayTodo();[...todoList.querySelectorAll('input')].find(item=>item.dataset.task===id)?.focus();};
  remove.onclick=()=>{delete editTasks(date)[id];offerTaskUndo(date,id,task);save();renderDayTodo();todoInput.focus();};row.append(label,remove);return row;
 }));
 if(!entries.length)todoList.append(node('p','Ajoute une tâche pour préparer ton départ du chantier.','hint'));
}
todoForm.onsubmit=event=>{
 event.preventDefault();const text=todoInput.value.trim();if(!text){todoError.textContent='Écris une tâche à ajouter.';return;}
 const date=selectedDate();if(Object.keys(savedTasks(date)).length>=50){todoError.textContent='50 tâches maximum pour cette journée.';return;}
 editTasks(date)['task-'+crypto.randomUUID()]={text,done:false};todoInput.value='';todoError.textContent='';save();renderDayTodo();todoInput.focus();
};
const renderToolsWithTasks=renderDailyTools;renderDailyTools=function(){renderToolsWithTasks();renderDayTodo();};
