'use strict';
// Version D : bleu nuit, anneau de la semaine, graphique des jours et barre de navigation.
// Cette couche réorganise l'affichage seulement : calculs, données, PDF et envoi restent ceux d'origine.
document.body.classList.add('theme-d');
document.querySelector('meta[name="theme-color"]').content='#0E1424';
const svgNS='http://www.w3.org/2000/svg';
function dSvg(tag,attrs={},children=[]){const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);el.append(...children);return el;}
function dIcon(d,size=20){return dSvg('svg',{viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':'1.9','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'},[dSvg('path',{d})]);}
const D_ICONS={
 prev:'M15 18l-6-6 6-6',next:'M9 18l6-6-6-6',plus:'M12 5v14M5 12h14',
 week:'M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM3 9h18M8 2v4M16 2v4',
 calendar:'M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01',
 chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
 settings:'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
 send:'M22 2L11 13M22 2l-7 20-4-9-9-4z',refresh:'M20 8a8 8 0 1 0 0 8M20 3v5h-5'
};
const shortHours=m=>m?Math.floor(m/60)+'h'+(m%60?String(m%60).padStart(2,'0'):''):'—';

// En-tête : initiales, salutation, semaine et flèches.
const dHeader=node('div',null,'d-header'),dAvatar=node('span',null,'d-avatar'),dTitles=node('div',null,'d-titles'),dHello=node('p',null,'d-hello'),dWeekTitle=node('h1',null,'d-week-title'),dActions=node('div',null,'d-header-actions');
dAvatar.setAttribute('aria-hidden','true');dTitles.append(dHello,dWeekTitle);
$('refresh-app').replaceChildren(dIcon(D_ICONS.refresh,18));$('week-back').replaceChildren(dIcon(D_ICONS.prev,18));$('week-forward').replaceChildren(dIcon(D_ICONS.next,18));
dActions.append($('refresh-app'),$('week-back'),$('week-forward'));dHeader.append(dAvatar,dTitles,dActions);
const dMeta=node('div',null,'d-meta'),dWeekNumber=node('span',null,'d-week-number');dMeta.append(dWeekNumber,stateButton,currentWeekButton);
$('simple-home').prepend(dHeader,dMeta);

// Anneau : heures saisies sur 35 h, avec reste, heures sup et jours remplis.
const dSummary=node('section',null,'d-card d-summary');dSummary.setAttribute('aria-label','Résumé de la semaine');
const RING=2*Math.PI*50,dRingFill=dSvg('circle',{cx:60,cy:60,r:50,class:'d-ring-fill',transform:'rotate(-90 60 60)','stroke-dasharray':`0 ${RING}`});
const dRingValue=dSvg('text',{x:60,y:60,'text-anchor':'middle',class:'d-ring-value'}),dRingGoal=dSvg('text',{x:60,y:79,'text-anchor':'middle',class:'d-ring-goal'});dRingGoal.textContent='/ 35 h';
const dRing=dSvg('svg',{viewBox:'0 0 120 120',class:'d-ring',role:'img'},[dSvg('circle',{cx:60,cy:60,r:50,class:'d-ring-track'}),dRingFill,dRingValue,dRingGoal]);
const dStats=node('dl',null,'d-stats');
function dStat(label){const row=node('div'),dt=node('dt',label),dd=node('dd');row.append(dt,dd);dStats.append(row);return {dt,dd,row};}
const statLeft=dStat('Reste'),statSup=dStat('Heures sup (8 h/j)'),statDays=dStat('Jours remplis');
const dSummaryBody=node('div',null,'d-summary-body');dSummaryBody.append(dStats,overtimeLink);
dSummary.append(dRing,dSummaryBody);

// Graphique : une barre par jour ouvré, un appui ouvre la journée.
const dChart=node('section',null,'d-card d-chart'),dBars=node('div',null,'d-bars');dChart.setAttribute('aria-label','Heures par jour');dChart.append(dBars);
$('week-cards').before(dSummary,dChart);

// Barre de navigation : Semaine, Calendrier, +, Bilan, Réglages.
const dPlus=node('button',null,'dock-item d-dock-plus');dPlus.type='button';dPlus.id='d-add-day';
const settingsButton=$('settings-open');settingsButton.className='dock-item';settingsButton.removeAttribute('title');
for(const [button,icon,label] of [[dockWeek,'week','Semaine'],[calendarButton,'calendar','Calendrier'],[dPlus,'plus','Saisir ma journée'],[dockMonth,'chart','Bilan'],[settingsButton,'settings','Réglages']]){
 button.replaceChildren(dIcon(D_ICONS[icon],button===dPlus?24:21),node('span',label,'d-sr'));
}
bottomDock.replaceChildren(dockWeek,calendarButton,dPlus,dockMonth,settingsButton);
dPlus.onclick=()=>{
 const today=new Date(),todayIndex=(today.getDay()+6)%7;
 const index=week===monday(iso(today))&&todayIndex<5?todayIndex:(expandedDay??selected);
 if(index>4&&!days()[index])return;
 selected=index;expandedDay=index;render();
 if(!$('add').disabled)openEditor();
 else $('simple-home').querySelector(`.week-card[data-day="${index}"]`)?.scrollIntoView({block:'start',behavior:'smooth'});
};

// Boutons d'envoi : l'envoi à la secrétaire passe devant, le PDF reste à côté.
gmailButton.classList.add('primary');gmailButton.replaceChildren(dIcon(D_ICONS.send,19),node('span','Envoyer ma feuille'));
$('check-pdf').classList.remove('primary');$('check-pdf').textContent='Vérifier et télécharger le PDF';
const downloadBar=$('simple-home').querySelector('.download-bar');downloadBar.prepend(gmailButton);

function renderRedesign(){
 const ds=days(),from=new Date(week+'T12:00:00'),thisWeek=week===monday(iso(new Date()));
 const first=(store.name||'').trim().split(/\s+/);
 const firstName=first.length>1?first[first.length-1]:first[0]||'';
 dAvatar.textContent=first.filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'ASC';
 dHello.textContent=firstName?'Bonjour '+firstName:'Bonjour';
 const to=new Date(from);to.setDate(to.getDate()+4);
 const month=d=>d.toLocaleDateString('fr-FR',{month:'short'});
 dWeekTitle.textContent=from.getMonth()===to.getMonth()?from.getDate()+' – '+to.getDate()+' '+month(to):from.getDate()+' '+month(from)+' – '+to.getDate()+' '+month(to);
 dWeekNumber.textContent='Semaine '+isoWeekNumber(from)+(thisWeek?'':' · '+from.getFullYear());
 const total=ds.reduce((n,day)=>n+daySum(day),0),sup=ds.reduce((n,day)=>n+Timesheet.dayOvertime(day),0);
 const filled=ds.slice(0,5).filter(day=>day.length).length;
 dRingFill.classList.toggle('is-zero',!total);dRingFill.setAttribute('stroke-dasharray',`${Math.min(1,total/2100)*RING} ${RING}`);
 dRingValue.textContent=shortHours(total)==='—'?'0h':shortHours(total);
 dRing.setAttribute('aria-label',fmt(total)+' saisies sur 35 h');
 dSummary.classList.toggle('is-over',total>2100);
 statLeft.dt.textContent=total>2100?'Au-delà de 35 h':'Reste';
 statLeft.dd.textContent=total>2100?'+'+fmt(total-2100):fmt(Math.max(0,2100-total));
 statLeft.row.dataset.tone=total>2100?'warn':'';
 statSup.dd.textContent=sup?'+'+fmt(sup):'0 h';statSup.row.dataset.tone=sup?'warn':'';
 statDays.dd.textContent=filled+' / 5';
 const max=Math.max(600,...ds.slice(0,5).map(daySum));
 dBars.replaceChildren(...ds.slice(0,5).map((day,index)=>{
  const minutes=daySum(day),date=new Date(from);date.setDate(date.getDate()+index);
  const absence=day.find(item=>isAbsence(item)),issues=SheetReview.dayIssues(day);
  const button=node('button',null,'d-bar');button.type='button';
  const on=expandedDay===index,today=iso(date)===iso(new Date());
  button.dataset.state=!day.length?'empty':absence?'absence':Timesheet.dayOvertime(day)||issues.length?'warn':'ok';
  if(on)button.setAttribute('aria-pressed','true');else button.setAttribute('aria-pressed','false');
  if(today)button.classList.add('d-today');
  const value=node('span',absence?absence.client.split(' ')[0]:shortHours(minutes),'d-bar-value');
  const fill=node('span',null,'d-bar-fill');fill.style.height=(day.length?Math.max(14,Math.round((absence?480:minutes)/max*100)):100)+'%';
  const track=node('span',null,'d-bar-track');track.append(fill);
  button.append(value,track,node('span',names[index].slice(0,3),'d-bar-name'));
  button.setAttribute('aria-label',names[index]+' '+date.getDate()+' : '+(absence?absence.client:day.length?fmt(minutes):'à remplir')+(issues.length?' · '+issues.join(', '):''));
  button.onclick=()=>{expandedDay=on?null:index;selected=index;render();if(!on)requestAnimationFrame(()=>$('simple-home').querySelector(`.week-card[data-day="${index}"]`)?.scrollIntoView({block:'start',behavior:'smooth'}));};
  return button;
 }));
}
const dPreviousHome=renderPolishedHome;
renderPolishedHome=function(){dPreviousHome();renderRedesign();};

// Saisie : choix du lieu en onglets, total en direct, + / − pour le trajet et le chantier.
const dKinds=node('div',null,'d-segmented');dKinds.setAttribute('role','group');dKinds.setAttribute('aria-label','Lieu de travail');
const kindButtons=[['client','Client'],['atelier','Atelier'],['school','École']].map(([value,label])=>{
 const button=node('button',label);button.type='button';button.dataset.value=value;
 button.onclick=()=>{if($('workplace').value===value)return;$('workplace').value=value;$('workplace').dispatchEvent(new Event('change'));};
 dKinds.append(button);return button;
});
const workplaceLabel=$('workplace').closest('label');workplaceLabel.classList.add('d-visually-hidden');workplaceLabel.before(dKinds);
function syncKinds(){for(const button of kindButtons)button.setAttribute('aria-pressed',String(button.dataset.value===$('workplace').value));}
const dLive=node('p',null,'d-live-total');dLive.setAttribute('aria-live','polite');
$('editor-title').after(dLive);
function editorMinutes(){
 const f=$('form').elements;let total=0;
 for(const key of fields){const input=f[key];if(!input||input.disabled||!input.value.trim())continue;const value=key==='travel'?Number(input.value):parseDuration(input.value);if(!Number.isFinite(value)||value<0)throw Error();total+=value;}
 return total;
}
function renderLive(){
 syncKinds();
 try{const total=editorMinutes(),extra=Math.max(0,daySum(days()[selected].filter((_,i)=>i!==editing))+total-480);dLive.textContent='Total de la ligne : '+fmt(total)+(extra&&total?' · +'+fmt(extra)+' sup dans la journée':'');dLive.dataset.tone=extra&&total?'warn':'';}
 catch{dLive.textContent='Total de la ligne : durée à corriger';dLive.dataset.tone='warn';}
}
$('form').addEventListener('input',renderLive);$('form').addEventListener('change',renderLive);
function addStepper(input,step,format){
 const wrap=node('div',null,'d-stepper'),minus=node('button','−'),plus=node('button','+');
 for(const [button,sign,label] of [[minus,-1,'Retirer'],[plus,1,'Ajouter']]){
  button.type='button';button.setAttribute('aria-label',label+' '+(format?step+' minutes':step+' minutes'));
  button.onclick=()=>{if(input.disabled)return;let current=0;try{current=format?parseDuration(input.value||'0'):Number(input.value)||0;}catch{current=0;}const next=Math.max(0,Math.min(format?1440:1440,current+sign*step));input.value=format?Math.floor(next/60)+'h'+String(next%60).padStart(2,'0'):String(next);input.dispatchEvent(new Event('input',{bubbles:true}));};
 }
 input.before(wrap);wrap.append(minus,input,plus);
}
addStepper($('form').elements.travel,10,false);
addStepper($('form').elements.chantier,30,true);
const dEditorOpen=openEditor;
openEditor=function(index=-1){dEditorOpen(index);renderLive();};
const dWorkplace=updateWorkplace;
updateWorkplace=function(){dWorkplace();syncKinds();};
const depotHint=[...$('client-fields').querySelectorAll('p.hint')].find(p=>p.textContent.includes('entreprise'));
if(depotHint)depotHint.textContent='Pour du temps au dépôt, choisissez « Atelier ».';
