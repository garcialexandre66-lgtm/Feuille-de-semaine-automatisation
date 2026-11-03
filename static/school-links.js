'use strict';
// The fragment is read only in the browser. Personal dates never belong in source assets.
function datesFromSchoolLink(hash){
 const raw=new URLSearchParams(hash.replace(/^#/,'' )).get('ecole');if(raw===null)return null;
 if(raw.length>12000)throw Error('Le lien de planning est trop long.');
 const values=raw.split(',');if(!values.length||values.length>400)throw Error('Le lien doit contenir de 1 à 400 dates.');
 const dates=values.map(value=>{
  if(!/^\d{8}$/.test(value))throw Error('Une date du planning est invalide.');
  const date=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8),parsed=new Date(date+'T00:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('Une date du planning est invalide.');
  return date;
 });
 return [...new Set(dates)].sort();
}
let pendingSchoolDates=null,importingSchoolLink=false,schoolLinkRevision=0;
let pendingSchoolRange=null;
const schoolLinkNote=node('p',null,'school-link-note');schoolLinkNote.id='school-link-login-note';schoolLinkNote.hidden=true;$('login-form').before(schoolLinkNote);
const schoolLinkResult=node('section',null,'school-link-result'),schoolLinkText=node('p'),schoolLinkActions=node('div'),schoolLinkCalendar=node('button','Voir le calendrier'),schoolLinkRetry=node('button','Réessayer');
schoolLinkResult.id='school-link-result';schoolLinkResult.hidden=true;schoolLinkText.setAttribute('role','status');schoolLinkCalendar.type=schoolLinkRetry.type='button';schoolLinkRetry.hidden=true;schoolLinkActions.append(schoolLinkCalendar,schoolLinkRetry);schoolLinkResult.append(schoolLinkText,schoolLinkActions);$('simple-home').querySelector('.week-heading').before(schoolLinkResult);
schoolLinkCalendar.onclick=()=>calendarButton.click();schoolLinkRetry.onclick=()=>importSchoolLink();
function readSchoolLink(){
 schoolLinkRevision++;
 try{pendingSchoolDates=datesFromSchoolLink(location.hash);pendingSchoolRange=null;
 const params=new URLSearchParams(location.hash.slice(1));
 if(pendingSchoolDates&&params.get('remplacer')==='1'){
  const date=key=>{const value=params.get(key)||'';if(!/^\d{8}$/.test(value))throw Error('La période du planning est invalide.');return value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);};
  pendingSchoolRange={from:date('du'),to:date('au')};
  reconcileSchoolPlan({weeks:{},schoolDates:{}},pendingSchoolDates,pendingSchoolRange.from,pendingSchoolRange.to);
 }
 schoolLinkNote.hidden=!pendingSchoolDates;if(pendingSchoolDates)schoolLinkNote.textContent=pendingSchoolDates.length+' jours d’école sont prêts à être appliqués après votre connexion.';}
 catch(error){pendingSchoolDates=null;schoolLinkNote.hidden=false;schoolLinkNote.textContent=error.message;schoolLinkResult.hidden=false;schoolLinkText.textContent=error.message;schoolLinkCalendar.hidden=true;schoolLinkRetry.hidden=true;}
}
async function importSchoolLink(){
 if(importingSchoolLink||!pendingSchoolDates||$('application').hidden||typeof OfflineStore==='undefined'||!OfflineStore.ready())return;
 importingSchoolLink=true;
 const revision=schoolLinkRevision;
 try{
  const dates=[...pendingSchoolDates],next={...store.schoolDates};let added=0;
  for(const date of dates){if(!next[date])added++;next[date]=true;}
  let correction=null;
  if(pendingSchoolRange){correction=reconcileSchoolPlan(store,dates,pendingSchoolRange.from,pendingSchoolRange.to);checkStore(correction.store);store=correction.store;}
  else {Timesheet.extras({...store,schoolDates:next});store.schoolDates=next;}
  await syncSave();if(revision!==schoolLinkRevision)return;render();renderSchool();schoolLinkResult.hidden=false;schoolLinkCalendar.hidden=false;
  if(!cacheSaved){schoolLinkText.textContent='Le planning est prêt, mais la sauvegarde n’a pas abouti. Appuyez sur Réessayer.';schoolLinkRetry.hidden=false;return;}
  const first=new Date(dates[0]+'T12:00:00').toLocaleDateString('fr-FR'),last=new Date(dates[dates.length-1]+'T12:00:00').toLocaleDateString('fr-FR');
  schoolLinkText.textContent=correction?('Planning corrigé selon les '+dates.length+' dates du document. '+correction.removed+' lignes d’école automatiques retirées. Les journées de travail existantes sont conservées.'):dates.length+' jours d’école ajoutés au planning, du '+first+' au '+last+'.'+(!added?' Ces dates étaient déjà présentes.':'');
  schoolLinkRetry.hidden=true;schoolLinkNote.hidden=true;pendingSchoolDates=null;
  const fragment=new URLSearchParams(location.hash.slice(1));for(const key of ['ecole','remplacer','du','au'])fragment.delete(key);history.replaceState(null,'',location.pathname+location.search+(fragment.size?'#'+fragment.toString():''));
 }catch(error){schoolLinkResult.hidden=false;schoolLinkText.textContent='Import impossible : '+error.message;schoolLinkRetry.hidden=false;}
 finally{importingSchoolLink=false;if(pendingSchoolDates&&revision!==schoolLinkRevision)void importSchoolLink();}
}
readSchoolLink();window.addEventListener('hashchange',()=>{readSchoolLink();void importSchoolLink();});
