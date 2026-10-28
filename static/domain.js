'use strict';
(()=>{
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const dateKey=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const fields=['travel','tpe','regie','chantier','sav'];
 const dayTotal=day=>day.reduce((n,item)=>n+fields.reduce((m,k)=>m+item[k],0),0);
 const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 function extras(s){
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
 function monthSummary(s,month){
  const result={worked:0,overtime:0,leave:0,sick:0,days:0,lines:[]};
  for(const [week,days] of Object.entries(s.weeks))days.forEach((day,i)=>{
   if(!day.length)return;
   const date=new Date(week+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+i);const key=date.toISOString().slice(0,10);
   if(!key.startsWith(month+'-'))return;
   if(day[0].kind==='leave'){result.leave++;return;}if(day[0].kind==='sick'){result.sick++;return;}
   const minutes=dayTotal(day),extra=Math.max(0,minutes-480);result.worked+=minutes;result.overtime+=extra;result.days++;
   if(extra)result.lines.push({date:key,minutes:extra,total:minutes});
  });
  result.lines.sort((a,b)=>a.date.localeCompare(b.date));return result;
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
   result.weekMeta=map(base.weekMeta,local.weekMeta,remote.weekMeta);result.monthNotes=map(base.monthNotes,local.monthNotes,remote.monthNotes);result.preferences=map(base.preferences,local.preferences,remote.preferences);
   const byId=list=>Object.fromEntries((list||[]).map(f=>[f.id,f]));result.favorites=Object.values(map(byId(base.favorites),byId(local.favorites),byId(remote.favorites)));
   return extras(result);
  }catch{return null;}
 }
 globalThis.Timesheet=Object.freeze({extras,monthSummary,signature,sentStatus,merge,dayTotal});
})();
