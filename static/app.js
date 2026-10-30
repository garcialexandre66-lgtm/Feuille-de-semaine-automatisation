'use strict';
const $ = id => document.getElementById(id);
const names = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const fields = ['travel','tpe','regie','chantier','sav'];
const labels = ['trajet','TPE','régie','chantier','SAV'];
const fmt = m => `${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`;
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monday = value => {const d = new Date(value+'T12:00:00'); d.setDate(d.getDate()-((d.getDay()+6)%7)); return iso(d);};
const absenceLabels={leave:'Congé',sick:'Arrêt maladie',recovery:'Récupération'};
const isAbsence=item=>Object.hasOwn(absenceLabels,item.kind);
let absenceKind='leave';
const sum = item => fields.reduce((n,k)=>n+item[k],0);
const daySum = day => day.reduce((n,item)=>n+sum(item),0);
let store = {name:'',weeks:{}};
try {const saved=localStorage.getItem('asc-weeks-v1');if(saved)store=checkStore(JSON.parse(saved));} catch { $('status').textContent='La sauvegarde locale est indisponible ou illisible. Importez votre sauvegarde si nécessaire.';}
let week=monday(iso(new Date())), selected=Math.min(4,(new Date().getDay()+6)%7), editing=-1, step=0;
function checkStore(s){
 if(!s || typeof s.name!=='string' || s.name.length>100 || !s.weeks || typeof s.weeks!=='object' || Array.isArray(s.weeks))throw Error('Sauvegarde invalide.');
 for(const [date,days] of Object.entries(s.weeks)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date+'T12:00:00').getTime())||monday(date)!==date||!Array.isArray(days)||days.length!==7)throw Error('Semaine invalide.');
  for(const day of days){if(!Array.isArray(day)||day.length>8)throw Error('Plus de 8 interventions dans une journée.');
   for(const item of day){if(!item||typeof item.client!=='string'||typeof item.city!=='string'||item.client.length>200||item.city.length>200||fields.some(k=>!Number.isInteger(item[k])||item[k]<0||item[k]>1440)||['prep','intervention'].some(k=>item[k]!==undefined&&(typeof item[k]!=='string'||item[k].length>80)))throw Error('Intervention invalide.');}
   if(day.some(item=>isAbsence(item))&&(day.length!==1||daySum(day)!==0||day[0].client!==absenceLabels[day[0].kind]))throw Error('Une journée d’absence ne peut pas contenir d’heures travaillées.');
   if(daySum(day)>1440)throw Error('Une journée dépasse 24 heures.');
  }
 }
 return Timesheet.extras(s);
}
function days(){if(!Object.hasOwn(store.weeks,week))store.weeks[week]=Array.from({length:7},()=>[]);return store.weeks[week];}
function save(){syncSave();}
function node(tag,text,cls){const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
function render(){
 const ds=days(), totals=ds.map(daySum);renderHistory();rememberClients();$('name').value=store.name;$('week').value=week;
 $('total').textContent=fmt(totals.reduce((a,b)=>a+b,0));$('overtime').textContent=fmt(Timesheet.weekOvertime(ds));
 $('days').replaceChildren(...names.slice(0,5).map((n,i)=>{const b=node('button',n.slice(0,3),i===selected?'active':'');b.setAttribute('aria-pressed',i===selected);b.dataset.kind=ds[i].find(item=>isAbsence(item))?.kind||'work';b.append(node('span',ds[i].some(item=>isAbsence(item))?ds[i][0].client:fmt(totals[i])));b.onclick=()=>{selected=i;render();};return b;}));
 const date=new Date(week+'T12:00:00');date.setDate(date.getDate()+selected);
 $('daydate').textContent=date.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});$('daytitle').textContent=names[selected];$('daytotal').textContent=fmt(totals[selected]);
 const onLeave=ds[selected].some(item=>isAbsence(item));
 $('dayremaining').textContent=onLeave?ds[selected][0].client:totals[selected]===480?'Objectif de 8 h atteint':totals[selected]>480?`${fmt(totals[selected]-480)} au-delà de l’objectif de 8 h`:`${fmt(480-totals[selected])} pour atteindre 8 h`;
 $('progress').style.width=`${Math.min(totals[selected]/480*100,100)}%`;
 $('entries').replaceChildren();
 ds[selected].forEach((item,i)=>{const el=node('article',null,'entry'), info=node('div');el.dataset.kind=item.kind||item.workplace||'client';info.append(node('h3',item.client||'Temps pour l’entreprise'));if(item.city)info.append(node('p',item.city));info.append(node('p',fields.flatMap((k,j)=>item[k]?[`${labels[j]} : ${fmt(item[k])}`]:[]).join(' · ')));const actions=node('div',null,'actions');actions.append(node('strong',fmt(sum(item))));const edit=node('button','Modifier');edit.onclick=()=>openEditor(i);const remove=node('button','Supprimer');remove.onclick=()=>{if(confirm('Supprimer cette intervention ?')){ds[selected].splice(i,1);save();render();}};if(!isAbsence(item))actions.append(edit);actions.append(remove);el.append(info,actions);$('entries').append(el);});
 if(!ds[selected].length){const empty=node('div',null,'empty');empty.append(node('b','Une journée à remplir'),node('div','Ajoutez un chantier, un déplacement ou du temps au dépôt.'));$('entries').append(empty);}
 $('add').disabled=onLeave||ds[selected].length>=8;
 $('add').textContent=onLeave?'Retirez l’absence pour ajouter une intervention':'+ Ajouter mon travail';
 $('previous-day').disabled=selected===0; $('next-day').disabled=selected===4;
 $('next-day').textContent=selected<4?`Passer à ${names[selected+1].toLowerCase()} →`:'Fin de la semaine';
 renderWorkspace();
 if(typeof renderSimple==='function')renderSimple();
}
function openEditor(index=-1){editing=index;$('form').reset();$('error').textContent='';$('editor-title').textContent=index<0?'Nouvelle intervention':'Modifier l’intervention';if(index>=0){const item=days()[selected][index];$('workplace').value=['atelier','school'].includes(item.workplace)?item.workplace:'client';for(const k of ['client','city',...fields])$('form').elements[k].value=fields.includes(k)&&k!=='travel'?fmt(item[k]):item[k];}updateWorkplace();step=0;$('wizard-day').textContent=names[selected]+' · '+$('daydate').textContent;showStep();rememberClients();renderFavoriteChoices();$('editor').showModal();}
function parseDuration(text){const s=text.trim().toLowerCase();let m=s.match(/^(\d+)\s*(?:h|:)\s*(\d{1,2})?$/);if(m){if(Number(m[2]||0)>59)throw Error('Les minutes doivent être entre 0 et 59.');return Number(m[1])*60+Number(m[2]||0);}if(/^\d+$/.test(s))return Number(s)*60;throw Error('Saisissez une durée comme 2h30, 2:30 ou 2h.');}
$('add').onclick=()=>openEditor();$('cancel').onclick=()=>$('editor').close();
function isWorkshop(){return ['atelier','school'].includes($('workplace').value);}
function stepOrder(){return isWorkshop()?[0,1,3]:[0,1,2,3];}
function updateWorkplace(){
 const workshop=isWorkshop(),school=$('workplace').value==='school';
 $('tpe-label').textContent=school?'Temps d’école effectué':'TPE · dépôt / entreprise';$('atelier-note').textContent=school?'Sur votre feuille : École. Saisissez uniquement les heures de formation réellement effectuées.':'Sur votre feuille : Atelier ASC. Saisissez uniquement votre temps pour l’entreprise.';
 $('client-fields').hidden=workshop;$('atelier-note').hidden=!workshop;
 for(const input of $('client-fields').querySelectorAll('input'))input.disabled=workshop;
 $('travel-field').hidden=workshop;$('form').elements.travel.disabled=workshop;
 for(const key of ['regie','chantier','sav'])$('form').elements[key].disabled=workshop;
 $('travel-hint').hidden=workshop;
 $('time-heading').textContent=school?'Vos heures d’école effectuées':workshop?'Votre temps à l’entreprise':'Vos déplacements et le temps pour l’entreprise';
 document.querySelectorAll('.steps li')[1].textContent=school?'École':workshop?'TPE':'Trajet et TPE';
}
$('workplace').onchange=()=>{updateWorkplace();showStep();};
function readItem(){
 const f=$('form').elements,item={client:f.client.value.trim(),city:f.city.value.trim(),prep:f.prep?.value.trim()||'',intervention:f.intervention?.value.trim()||''};
 for(const k of fields)item[k]=isWorkshop()&&k!=='tpe'?0:k==='travel'?Number(f[k].value):parseDuration(f[k].value);
 if(isWorkshop()){const school=$('workplace').value==='school';item.client=school?'École':'Atelier ASC';item.city='';item.prep='';item.intervention='';item.workplace=school?'school':'atelier';}
 if(!sum(item))throw Error('Indiquez au moins une durée.');
 const day=[...days()[selected]];if(editing<0)day.push(item);else day[editing]=item;
 checkStore({name:store.name,weeks:{[week]:days().map((d,i)=>i===selected?day:d)}});
 return {item,day};
}
function showStep(){
 document.querySelectorAll('.wizard-page').forEach((p,i)=>{p.hidden=i!==step;});
 document.querySelectorAll('.steps li').forEach((p,i)=>{p.hidden=!stepOrder().includes(i);p.classList.toggle('current',i===step);if(i===step)p.setAttribute('aria-current','step');else p.removeAttribute('aria-current');});
 $('step-count').textContent=`Étape ${stepOrder().indexOf(step)+1} sur ${stepOrder().length}`;$('previous').disabled=step===0;
 $('next').textContent=step===3?'Enregistrer cette ligne':'Suivant →';$('error').textContent='';
 $('remember-favorite-label').hidden=isWorkshop();
 if(step===3){const {item,day}=readItem();$('recap').replaceChildren();
  $('recap').append(node('h4',item.client||'Temps pour l’entreprise'),node('p',item.city));
  fields.forEach((k,i)=>{if(item[k])$('recap').append(node('p',`${labels[i]} : ${fmt(item[k])}`));});
  $('recap').append(node('strong',`Cette ligne : ${fmt(sum(item))}`),node('p',`Total de la journée après enregistrement : ${fmt(daySum(day))}`),node('p',`Heures au-delà de 8 h pour cette journée : ${fmt(Math.max(0,daySum(day)-480))}. Le compteur de récupération est calculé sur la semaine de 35 h.`));
 }
 const focus=document.querySelector('.wizard-page:not([hidden]) select, .wizard-page:not([hidden]) input:not(:disabled)')||$('next');focus.focus();
}
$('previous').onclick=()=>{if(step>0){step=stepOrder()[stepOrder().indexOf(step)-1];showStep();}};
$('previous-day').onclick=()=>{if(selected>0){selected--;render();}};
$('next-day').onclick=()=>{if(selected<4){selected++;render();}};
$('form').onsubmit=e=>{e.preventDefault();try{
 const page=document.querySelectorAll('.wizard-page')[step];
 for(const input of page.querySelectorAll('input:not(:disabled)')){
  if(!input.checkValidity()){input.reportValidity();return;}
  if(fields.includes(input.name)&&input.name!=='travel'){const n=parseDuration(input.value);if(n<0||n>1440)throw Error('Une durée ne peut pas dépasser 24 heures.');}
 }
 if(step<3){const next=stepOrder()[stepOrder().indexOf(step)+1];if(next===3)readItem();step=next;showStep();return;}
 const {item,day}=readItem();if($('remember-favorite').checked&&!isWorkshop())rememberFavoriteItem(item);store.weeks[week][selected]=day;save();render();$('editor').close();
}catch(err){$('error').textContent=err.message;}};
$('name').oninput=()=>{store.name=$('name').value;save();renderWorkspace();renderHistory();};
$('week').onchange=()=>{if(!$('week').value)return;week=monday($('week').value);render();};
function download(blob,name){const a=node('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('backup').onclick=()=>download(new Blob([JSON.stringify(store,null,2)],{type:'application/json'}),'mes-semaines-asc.json');
$('restore').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>5_000_000)throw Error('Fichier trop volumineux.');const raw=JSON.parse(await f.text()),hadRecovery=Object.hasOwn(raw,'recovery');const incoming=checkStore(raw);if(!hadRecovery)incoming.recovery=store.recovery;if(confirm('Importer cette sauvegarde ? Les semaines présentes dans le fichier remplaceront les mêmes semaines sur cet appareil.')){store=mergeImported(store,incoming);save();render();}}catch(err){$('status').textContent='Import impossible : '+err.message;}$('file').value='';};
function preparePdf(){
 const payload=JSON.parse(JSON.stringify({name:store.name,week,days:days()}));
 if(!payload.days.some(day=>day.length)){$('status').textContent='Cette semaine est vide. Choisissez la semaine réellement remplie dans l’historique.';return null;}
 const weekend=payload.days.slice(5).flatMap((day,index)=>day.map(item=>{
  const date=new Date(payload.week+'T12:00:00');date.setDate(date.getDate()+5+index);
  return `${names[5+index]} ${date.toLocaleDateString('fr-FR')} : ${item.client||'Sans client'}${item.city?' · '+item.city:''} · trajet ${item.travel} min · total ${fmt(sum(item))}`;
 }));
 if(weekend.length&&!confirm(`Des entrées existent le week-end :\n\n${weekend.join('\n')}\n\nLe PDF contient uniquement lundi à vendredi. Ces entrées restent enregistrées, mais leurs lignes et leurs heures seront exclues du PDF et de ses totaux.\n\nOK : continuer sans ces entrées.\nAnnuler : revenir à l’application sans télécharger ni partager.`)){$('status').textContent='Export annulé. Les entrées du week-end sont conservées.';return null;}
 payload.days=payload.days.slice(0,5);
 return payload;
}
function pdfFilename(payload){
 const end=new Date(payload.week+'T12:00:00');end.setDate(end.getDate()+4);
 const date=value=>new Date(value+'T12:00:00').toLocaleDateString('fr-FR').replaceAll('/','-');
 return `Semaine du ${date(payload.week)} au ${date(iso(end))}.pdf`;
}
async function weekBlob(pdf=true,payload={name:store.name,week,days:days()}){
 if(window.ASC_CLOUDFLARE){const exporter=await import('/cloud-export.js');return pdf?exporter.createPdf(payload):exporter.createOds(payload);}
 if(pdf&&payload.days.length===5)payload={...payload,days:[...payload.days,[],[]]};
 const res=await fetch(pdf?'/export/pdf':'/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw Error(await res.text());return res.blob();
}
async function exportWeek(pdf=true){
 if(!store.name.trim()){$('status').textContent='Indiquez votre nom dans les réglages avant d’exporter.';openSettings();$('name').focus();return;}
 const payload=pdf?preparePdf():JSON.parse(JSON.stringify({name:store.name,week,days:days()}));
 if(!payload)return;
 const button=$(pdf?'export':'export-ods');button.disabled=true;
 try{download(await weekBlob(pdf,payload),pdf?pdfFilename(payload):`feuille-semaine-${payload.week}.ods`);$('status').textContent=pdf?'PDF téléchargé. Vous pourrez le joindre à votre mail.':'Fichier ODS téléchargé.';}
 catch(err){$('status').textContent='Export impossible : '+err.message;}
 finally{button.disabled=false;}
}
$('export').onclick=()=>exportWeek(true);
$('export-ods').onclick=()=>exportWeek(false);

function rememberClients(){
 const known=new Map();
 for(const key of Object.keys(store.weeks).sort())for(const day of store.weeks[key])for(const item of day){
  if(!isAbsence(item)&&item.client&&!['atelier','school'].includes(item.workplace)&&item.client!=='Atelier ASC')known.set(item.client,item.city);
 }
 $('remembered-clients').replaceChildren(...Array.from(known,([client,city])=>{const option=node('option');option.value=client;option.label=city?`${client} · ${city}`:client;return option;}));
 return known;
}
$('form').elements.client.addEventListener('change',()=>{const city=rememberClients().get($('form').elements.client.value);if(city!==undefined)$('form').elements.city.value=city;});
function renderHistory(){
 const keys=Object.keys(store.weeks).filter(k=>store.weeks[k].some(day=>day.length)).sort().reverse();
 $('history-list').replaceChildren();
 if(!keys.length)$('history-list').append(node('p','Vos semaines enregistrées apparaîtront ici.'));
 for(const key of keys){const b=node('button',`${new Date(key+'T12:00:00').toLocaleDateString('fr-FR')} · ${fmt(store.weeks[key].reduce((n,d)=>n+daySum(d),0))} · ${Timesheet.sentStatus(store,key)}`);b.onclick=()=>{week=key;setView('weeks');render();$('week').focus();};$('history-list').append(b);}
}
$('workshop-day').onclick=()=>{
 if(days()[selected].length&&!confirm('Remplacer les interventions de cette journée par 8 h à l’atelier ?'))return;
 store.weeks[week][selected]=[{client:'Atelier ASC',city:'',workplace:'atelier',travel:0,tpe:480,regie:0,chantier:0,sav:0}];save();render();
};
function copySources(){
 const key=$('copy-week').value;
 $('copy-source').replaceChildren(...names.slice(0,5).map((name,i)=>{const option=node('option',`${name} · ${fmt(daySum(store.weeks[key][i]))}`);option.value=i;option.disabled=!store.weeks[key][i].length;return option;}));
 const first=store.weeks[key].slice(0,5).findIndex(day=>day.length);$('copy-source').value=first>=0?String(first):'';
}
$('copy-day').onclick=()=>{
 const keys=Object.keys(store.weeks).filter(k=>store.weeks[k].slice(0,5).some(d=>d.length)).sort().reverse();
 if(!keys.length){$('status').textContent='Enregistrez une première journée avant de la copier.';return;}
 $('copy-week').replaceChildren(...keys.map(k=>{const o=node('option',`Semaine du ${new Date(k+'T12:00:00').toLocaleDateString('fr-FR')}`);o.value=k;return o;}));
 if(keys.includes(week))$('copy-week').value=week;copySources();$('copy-error').textContent='';
 $('copy-target').textContent=`Destination : ${names[selected].toLowerCase()}, semaine du ${new Date(week+'T12:00:00').toLocaleDateString('fr-FR')}`;
 $('copy-dialog').showModal();
};
$('copy-week').onchange=copySources;$('copy-cancel').onclick=()=>$('copy-dialog').close();
$('copy-form').onsubmit=e=>{e.preventDefault();const source=store.weeks[$('copy-week').value]?.[Number($('copy-source').value)];if(!source?.length){$('copy-error').textContent='Choisissez une journée remplie.';return;}if(days()[selected].length&&!confirm('Remplacer les interventions de cette journée par la copie ?'))return;store.weeks[week][selected]=JSON.parse(JSON.stringify(source));save();render();$('copy-dialog').close();};

function selectedDate(){const d=new Date(week+'T12:00:00');d.setDate(d.getDate()+selected);return iso(d);}
function leaveDates(){
 const from=$('leave-start').value,to=$('leave-end').value;
 if(!from||!to)throw Error('Choisissez les deux dates.');
 if(from>to)throw Error('La fin de la période doit être après son début.');
 const start=new Date(from+'T12:00:00'),end=new Date(to+'T12:00:00');
 if(absenceKind==='leave'&&end.getDay()===5)end.setDate(end.getDate()+1);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))throw Error('Dates invalides.');
 const dates=[];let count=0;
 for(const d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
  if(++count>366)throw Error('Sélectionnez une période de 366 jours maximum.');
  if(absenceKind==='leave'?d.getDay()!==0:absenceKind==='recovery'?![0,6].includes(d.getDay()):($('leave-weekend').checked||![0,6].includes(d.getDay())))dates.push(iso(d));
 }
 if(!dates.length)throw Error(absenceKind==='leave'?'Aucun jour de congé sélectionné : les dimanches ne comptent pas.':absenceKind==='recovery'?'Les récupérations se posent du lundi au vendredi.':'Aucun jour sélectionné. Cochez les week-ends si nécessaire.');
 return dates;
}
function leavePreview(){try{const dates=leaveDates();$('leave-preview').textContent=`${dates.length} journée${dates.length>1?'s':''} · ${absenceLabels[absenceKind]} · ${absenceKind==='leave'?'samedi compté, dimanche exclu':$('leave-weekend').checked?'week-ends inclus':'du lundi au vendredi'}`;$('leave-error').textContent='';}catch(error){$('leave-preview').textContent='';$('leave-error').textContent=error.message;}}
function openAbsence(kind){
 absenceKind=kind;$('leave-rule').hidden=kind!=='leave';$('leave-weekend-label').hidden=kind==='leave'||kind==='recovery';$('leave-title').textContent=kind==='leave'?'Prévoir mes congés':kind==='recovery'?'Prévoir une récupération de 8 h':'Enregistrer un arrêt maladie';
 $('leave-start').value=selectedDate();$('leave-end').value=selectedDate();$('leave-weekend').checked=selected>=5;
 leavePreview();$('leave-dialog').showModal();
}
$('leave').onclick=()=>openAbsence('leave');
$('sick').onclick=()=>openAbsence('sick');
$('recovery-day').onclick=()=>openAbsence('recovery');
$('leave-one').onclick=()=>{$('leave-start').value=selectedDate();$('leave-end').value=selectedDate();$('leave-weekend').checked=selected>=5;leavePreview();};
$('leave-week').onclick=()=>{const end=new Date(week+'T12:00:00');end.setDate(end.getDate()+6);$('leave-start').value=week;$('leave-end').value=iso(end);leavePreview();};
for(const id of ['leave-start','leave-end','leave-weekend'])$(id).onchange=leavePreview;
$('leave-cancel').onclick=()=>$('leave-dialog').close();
$('leave-form').onsubmit=event=>{
 event.preventDefault();try{
  const dates=leaveDates();
  const targets=dates.map(date=>({week:monday(date),day:(new Date(date+'T12:00:00').getDay()+6)%7}));
  const replaced=targets.filter(t=>store.weeks[t.week]?.[t.day]?.some(item=>item.kind!==absenceKind)).length;
  if(replaced&&!confirm(`${replaced} journée(s) sont déjà renseignées. Les remplacer par « ${absenceLabels[absenceKind]} » ?`))return;
  if(absenceKind==='recovery'&&!confirm(`${dates.length} journée(s) de récupération de 8 h : ${fmt(dates.length*480)} seront déduites ou réservées dans le compteur. Continuer ?`))return;
  const updated=JSON.parse(JSON.stringify(store));
  for(const target of targets){if(!Object.hasOwn(updated.weeks,target.week))updated.weeks[target.week]=Array.from({length:7},()=>[]);
   updated.weeks[target.week][target.day]=[{kind:absenceKind,client:absenceLabels[absenceKind],city:'',travel:0,tpe:0,regie:0,chantier:0,sav:0}];
  }
  checkStore(updated);store=updated;week=targets[0].week;selected=Math.min(4,targets[0].day);save();render();$('leave-dialog').close();
  $('status').textContent=`${dates.length} journée(s) « ${absenceLabels[absenceKind]} » enregistrée(s). Synchronisation en cours…`;
 }catch(error){$('leave-error').textContent=error.message;}
};
