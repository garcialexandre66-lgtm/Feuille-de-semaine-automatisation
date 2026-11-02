'use strict';
(()=>{
 const minutes=item=>['travel','tpe','regie','chantier','sav'].reduce((n,key)=>n+(item[key]||0),0);
 const absence=item=>['leave','sick','recovery'].includes(item.kind);
 const client=item=>!absence(item)&&!['atelier','school'].includes(item.workplace)&&!['Atelier ASC','École'].includes(item.client);
 function dayIssues(day){
  const issues=[];
  if(!day.length)issues.push('Journée vide');
  if(day.reduce((n,item)=>n+minutes(item),0)>600)issues.push('Plus de 10 h dans la journée');
  return issues;
 }
 function weekIssues(days){
  const labels=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  return days.flatMap((day,index)=>index<5?dayIssues(day).map(message=>({day:index,message:labels[index]+' : '+message})):day.map((item,line)=>({day:index,message:`${labels[index]} · ${item.client||'Sans client'}${item.city?' · '+item.city:''} · trajet ${item.travel||0} min · ${Math.floor(minutes(item)/60)} h ${String(minutes(item)%60).padStart(2,'0')} : exclu du PDF`})));
 }
 globalThis.SheetReview=Object.freeze({dayIssues,weekIssues,minutes,absence,client});
})();
