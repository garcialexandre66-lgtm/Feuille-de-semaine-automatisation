'use strict';
(()=>{
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const dateKey=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const fields=['travel','tpe','regie','chantier','sav'];
 const dayTotal=day=>day.reduce((n,item)=>n+fields.reduce((m,k)=>m+item[k],0),0);
 const weekEnd=week=>{const d=new Date(week+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+4);return d.toISOString().slice(0,10);};
 const weekOvertime=days=>Math.max(0,days.reduce((n,d)=>n+dayTotal(d),0)-2100);
 const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 function extras(s){
  s.recovery??={openingMinutes:null,startDate:new Date().toISOString().slice(0,10),weeks:{}};s.schoolDates??={};
  if(!object(s.recovery)||!dateKey(s.recovery.startDate)||(s.recovery.openingMinutes!==null&&(!Number.isInteger(s.recovery.openingMinutes)||Math.abs(s.recovery.openingMinutes)>600000))||!object(s.recovery.weeks)||!object(s.schoolDates))throw Error('Compteur de récupération invalide.');
  for(const [key,v] of Object.entries(s.recovery.weeks)){if(!dateKey(key)||new Date(key+'T00:00:00Z').getUTCDay()!==1||!object(v)||!['work','school'].includes(v.source)||!Number.isInteger(v.credit)||v.credit<0||v.credit>10080||!/^[a-f0-9]{8}$/.test(v.signature)||typeof v.confirmedAt!=='string'||!Number.isFinite(Date.parse(v.confirmedAt)))throw Error('Validation de récupération invalide.');}
  for(const [key,v] of Object.entries(s.schoolDates))if(!dateKey(key)||v!==true)throw Error('Planning école invalide.');
  s.weekMeta??={};s.monthNotes??={};s.favorites??=[];s.preferences??={fridayReminder:true};
  if(!object(s.weekMeta)||!object(s.monthNotes)||!object(s.preferences)||!Array.isArray(s.favorites)||s.favorites.length>100)throw Error('Réglages ou favoris invalides.');
  for(const [key,value] of Object.entries(s.weekMeta))if(!dateKey(key)||!object(value)||typeof value.sentAt!=='string'||!Number.isFinite(Date.parse(value.sentAt))||!/^[a-f0-9]{8}$/.test(value.signature))throw Error('Statut de semaine invalide.');
  if(Object.keys(s.monthNotes).length>1200)throw Error('Trop de notes mensuelles.');
  for(const [key,value] of Object.entries(s.monthNotes))if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)||typeof value!=='string'||value.length>10000)throw Error('Note mensuelle invalide (10 000 caractères maximum).');
  const ids=new Set();
  for(const f of s.favorites){if(!object(f)||typeof f.id!=='string'||f.id.length>100||!f.id||ids.has(f.id)||typeof f.client!=='string'||!f.client.trim()||f.client.length>200||typeof f.city!=='string'||f.city.length>200||!Number.isInteger(f.travel)||f.travel<0||f.travel>1440)throw Error('Favori invalide.');ids.add(f.id);}
  if(s.preferences.fridayReminder!==undefined&&typeof s.preferences.fridayReminder!=='boolean')throw Error('Rappel invalide.');
  return s;
 }
 function creditValid(s,week,now=new Date()){
  const item=s.recovery?.weeks?.[week];if(!item)return false;
  const friday=new Date(week+'T00:00:00Z');friday.setUTCDate(friday.getUTCDate()+4);
  return friday.toISOString().slice(0,10)<=now.toISOString().slice(0,10)&&item.signature===signature('',s.weeks[week]||Array.from({length:7},()=>[]));
 }
 function monthSummary(s,month){
  const result={worked:0,overtime:0,leave:0,sick:0,recovery:0,school:0,days:0,lines:[]};
  for(const [week,days] of Object.entries(s.weeks)){
   days.forEach((day,i)=>{
    if(!day.length)return;const d=new Date(week+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const key=d.toISOString().slice(0,10);if(!key.startsWith(month+'-'))return;
    if(day[0].kind==='leave'){result.leave++;return;}if(day[0].kind==='sick'){result.sick++;return;}if(day[0].kind==='recovery'){result.recovery+=480;return;}
    result.worked+=dayTotal(day);result.days++;
   });
  }
  for(const week of new Set([...Object.keys(s.weeks),...Object.keys(s.recovery?.weeks||{})])){
   const date=weekEnd(week);if(!date.startsWith(month+'-'))continue;
   const confirmation=s.recovery?.weeks[week],school=confirmation?.source==='school'&&creditValid(s,week);
   const days=s.weeks[week]||Array.from({length:7},()=>[]),total=school?2340:days.reduce((n,d)=>n+dayTotal(d),0),extra=school?240:weekOvertime(days);
   if(school)result.school+=2340;
   result.overtime+=extra;if(extra)result.lines.push({date,week,minutes:extra,total,school,validated:creditValid(s,week)});
  }
  result.lines.sort((a,b)=>a.date.localeCompare(b.date));return result;
 }
 function recoverySummary(s,now=new Date()){
  const r=s.recovery,result={known:r.openingMinutes!==null,opening:r.openingMinutes,earned:0,taken:0,planned:0,invalid:0,lines:[]},today=now.toISOString().slice(0,10);
  for(const [week,item] of Object.entries(r.weeks)){
   if(weekEnd(week)<r.startDate)continue;
   if(!creditValid(s,week,now)){result.invalid++;continue;}
   result.earned+=item.credit;result.lines.push({date:weekEnd(week),label:item.source==='school'?'Semaine école confirmée':'Semaine entreprise confirmée',minutes:item.credit});
  }
  for(const [week,days] of Object.entries(s.weeks))days.forEach((day,i)=>{
   if(day[0]?.kind!=='recovery')return;const d=new Date(week+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10);if(date<r.startDate)return;
   if(date>today)result.planned+=480;else result.taken+=480;
   result.lines.push({date,label:date>today?'Récupération prévue':'Récupération prise',minutes:-480});
  });
  result.change=result.earned-result.taken;result.balance=result.known?r.openingMinutes+result.change:null;result.available=result.known?result.balance-result.planned:null;result.lines.sort((a,b)=>b.date.localeCompare(a.date));return result;
 }
 function signature(name,days){let h=2166136261;for(const c of JSON.stringify([name,days])){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
 function sentStatus(s,week){const meta=s.weekMeta?.[week];if(!meta)return 'À envoyer';return meta.signature===signature(s.name,s.weeks[week]||[])?'Envoyée':'À renvoyer';}
 function merge(base,local,remote){
  function choose(a,b,c){if(JSON.stringify(b)===JSON.stringify(c))return clone(b);if(JSON.stringify(a)===JSON.stringify(b))return c===undefined?undefined:clone(c);if(JSON.stringify(a)===JSON.stringify(c))return b===undefined?undefined:clone(b);throw Error('Conflit');}
  function map(a={},b={},c={}){const out={};for(const key of new Set([...Object.keys(a),...Object.keys(b),...Object.keys(c)])){const v=choose(a[key],b[key],c[key]);if(v!==undefined)out[key]=v;}return out;}
  try{
   const result={...remote,name:choose(base.name,local.name,remote.name),weeks:{}};
   for(const key of new Set([...Object.keys(base.weeks),...Object.keys(local.weeks),...Object.keys(remote.weeks)])){
    const empty=Array.from({length:7},()=>[]),a=base.weeks[key]||empty,b=local.weeks[key]||empty,c=remote.weeks[key]||empty;
    result.weeks[key]=a.map((v,i)=>choose(v,b[i],c[i]));
   }
   result.schoolDates=map(base.schoolDates,local.schoolDates,remote.schoolDates);
   result.recovery={openingMinutes:choose(base.recovery?.openingMinutes??null,local.recovery?.openingMinutes??null,remote.recovery?.openingMinutes??null),startDate:choose(base.recovery?.startDate,local.recovery?.startDate,remote.recovery?.startDate),weeks:map(base.recovery?.weeks,local.recovery?.weeks,remote.recovery?.weeks)};
   result.weekMeta=map(base.weekMeta,local.weekMeta,remote.weekMeta);result.monthNotes=map(base.monthNotes,local.monthNotes,remote.monthNotes);result.preferences=map(base.preferences,local.preferences,remote.preferences);
   const byId=list=>Object.fromEntries((list||[]).map(f=>[f.id,f]));result.favorites=Object.values(map(byId(base.favorites),byId(local.favorites),byId(remote.favorites)));
   return extras(result);
  }catch{return null;}
 }
 globalThis.Timesheet=Object.freeze({extras,monthSummary,signature,sentStatus,merge,dayTotal,weekOvertime,weekEnd,creditValid,recoverySummary});
})();
