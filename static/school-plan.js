'use strict';
// Reconcile only the supplied period; dates are provided privately by the user.
function reconcileSchoolPlan(input, dates, from, to){
 const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(from)||!valid(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>730||!dates.length||dates.length>400||dates.some(date=>!valid(date)||date<from||date>to))throw Error('La période du planning est invalide.');
 const next=JSON.parse(JSON.stringify(input)),wanted=new Set(dates);let removed=0,filled=0;
 next.schoolDates=next.schoolDates||{};next.weeks=next.weeks||{};
 const slot=date=>{const d=new Date(date+'T12:00:00Z'),index=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-index);return [d.toISOString().slice(0,10),index];};
 const automatic=item=>item.client==='École'&&item.workplace==='school'&&item.tpe===420&&['travel','regie','chantier','sav'].every(key=>item[key]===0)&&['city','prep','intervention'].every(key=>item[key]==='')&&Object.keys(item).every(key=>['client','city','workplace','travel','tpe','regie','chantier','sav','prep','intervention'].includes(key));
 for(const date of Object.keys(next.schoolDates)){
  if(date<from||date>to||wanted.has(date))continue;
  delete next.schoolDates[date];const [week,index]=slot(date),day=next.weeks[week]?.[index];
  if(day){const kept=day.filter(item=>!automatic(item));removed+=day.length-kept.length;next.weeks[week][index]=kept;}
 }
 for(const date of wanted){
  next.schoolDates[date]=true;const [week,index]=slot(date);
  if(!next.weeks[week])next.weeks[week]=Array.from({length:7},()=>[]);
  if(!next.weeks[week][index].length){next.weeks[week][index]=[{client:'École',city:'',workplace:'school',travel:0,tpe:420,regie:0,chantier:0,sav:0,prep:'',intervention:''}];filled++;}
 }
 return {store:next,removed,filled};
}
