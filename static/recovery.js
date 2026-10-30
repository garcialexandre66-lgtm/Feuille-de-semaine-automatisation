'use strict';
const signedMinutes=m=>(m<0?'− ':m>0?'+ ':'')+fmt(Math.abs(m));
function creditPreview(){
 const source=$('credit-source').value,total=days().reduce((n,d)=>n+daySum(d),0),credit=source==='school'?240:Timesheet.weekOvertime(days());
 $('credit-duration').value=fmt(credit);$('credit-description').textContent=source==='school'?'Une semaine d’école de 39 h confirmée donne 4 h à récupérer.':`${fmt(total)} saisies − 35 h de contrat : ${fmt(credit)} proposées. Vérifiez avant de valider.`;
}
function renderRecovery(){
 const report=Timesheet.estimatedRecovery(store);
 $('recovery-balance').textContent=report.known?signedMinutes(report.available)+' estimées disponibles':signedMinutes(report.change)+' suivies';
 $('recovery-description').textContent=`Contrat de 35 h : les heures saisies au-delà de 35 h par semaine sont comptées automatiquement. Un RTT pris déduit 8 h. ${report.known?`Avant RTT prévus : ${signedMinutes(report.balance)}.`:'Ancien solde inconnu : le chiffre couvre seulement les mouvements depuis le début du suivi.'}`;
 $('recovery-earned').textContent=fmt(report.earned);$('recovery-taken').textContent=fmt(report.taken);$('recovery-planned').textContent=fmt(report.planned);
 $('recovery-warning').textContent='Estimation d’après vos saisies, à comparer au décompte de la secrétaire. Les heures futures sont exclues, les RTT prévus sont réservés et les corrections recalculent le compteur sans doublon.';
 if(document.activeElement!==$('recovery-start'))$('recovery-start').value=store.recovery.startDate;
 if(document.activeElement!==$('recovery-opening'))$('recovery-opening').value=store.recovery.openingMinutes===null?'':signedMinutes(store.recovery.openingMinutes).replace('+ ','').replace('− ','-');
 if(![$('credit-duration'),$('credit-source'),$('credit-week')].includes(document.activeElement)){
  $('credit-week').value=week;$('credit-source').value=store.recovery.weeks[week]?.source||'work';creditPreview();
 }
 const schoolDone=days()[selected].some(item=>item.workplace==='school');$('school-badge').hidden=!store.schoolDates[selectedDate()]&&!schoolDone;$('school-badge').textContent=schoolDone?'École · heures saisies':'École prévue';
 const estimated=report.lines.map(line=>node('p',`Semaine du ${new Date(line.week+'T12:00:00').toLocaleDateString('fr-FR')} · ${signedMinutes(line.minutes)}${line.confirmed?' · crédit confirmé':line.ongoing?' · semaine en cours':' · calcul automatique'}`));
 const debits=Timesheet.recoverySummary(store).lines.filter(line=>line.minutes<0).map(line=>node('p',`${new Date(line.date+'T12:00:00').toLocaleDateString('fr-FR')} · ${line.label} · ${signedMinutes(line.minutes)}`));
 $('recovery-history').replaceChildren(...estimated,...debits);
 if(!estimated.length&&!debits.length)$('recovery-history').append(node('p','Aucun mouvement depuis le début du suivi.','hint'));
}
$('opening-form').onsubmit=event=>{
 event.preventDefault();try{
  const input=$('recovery-opening').value.trim(),negative=input.startsWith('-'),opening=input?(negative?-1:1)*parseDuration(negative?input.slice(1):input):null;
  const next={...store.recovery,startDate:$('recovery-start').value,openingMinutes:opening};Timesheet.extras({...store,recovery:next});
  if(!confirm('Enregistrer ce point de départ ? Il doit être le solde avant les mouvements suivis à partir de cette date.'))return;
  store.recovery=next;save();render();$('status').textContent=opening===null?'Le suivi commence avec un solde de départ inconnu.':'Point de départ enregistré.';
 }catch(error){$('status').textContent=error.message;}
};
$('credit-week').onchange=()=>{if(!$('credit-week').value)return;week=monday($('credit-week').value);$('credit-week').value=week;$('credit-source').value=store.recovery.weeks[week]?.source||'work';creditPreview();render();};$('credit-source').onchange=creditPreview;
$('validate-credit').onclick=()=>{
 try{
  $('credit-error').textContent='';if(Timesheet.weekEnd(week)<store.recovery.startDate)throw Error('Cette semaine précède le début du suivi. Ajustez votre point de départ pour l’inclure.');
  const friday=new Date(week+'T12:00:00');friday.setDate(friday.getDate()+4);if(iso(friday)>iso(new Date()))throw Error('Cette semaine pourra être validée à partir du vendredi, une fois les heures effectuées.');
  const credit=parseDuration($('credit-duration').value);if(!Number.isInteger(credit)||credit<0||credit>10080)throw Error('Crédit invalide.');
  if(!confirm(`Confirmer ${fmt(credit)} à récupérer pour la semaine du ${new Date(week+'T12:00:00').toLocaleDateString('fr-FR')} ? Une validation existante pour cette semaine sera remplacée, jamais ajoutée une seconde fois.`))return;
  store.recovery.weeks[week]={credit,source:$('credit-source').value,signature:Timesheet.signature('',days()),confirmedAt:new Date().toISOString()};save();render();$('status').textContent='Crédit de la semaine enregistré.';
 }catch(error){$('credit-error').textContent=error.message;$('status').textContent=error.message;}
};
function renderSchool(){
 const dates=Object.keys(store.schoolDates).sort();$('school-list').replaceChildren();
 if(!dates.length)$('school-list').append(node('p','Votre planning n’est pas encore renseigné. Vous pouvez ajouter des dates ici.','hint'));
 for(const date of dates){const row=node('div',null,'favorite-row');row.append(node('span',new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})));const remove=node('button','Retirer');remove.onclick=()=>{delete store.schoolDates[date];save();renderSchool();render();};row.append(remove);$('school-list').append(row);}
}
$('school-open').onclick=()=>{$('school-start').value=selectedDate();$('school-end').value=selectedDate();$('school-message').textContent='';renderSchool();$('school-dialog').showModal();};$('school-close').onclick=()=>$('school-dialog').close();
$('school-form').onsubmit=event=>{
 event.preventDefault();try{const from=$('school-start').value,to=$('school-end').value;if(!from||!to||from>to)throw Error('Choisissez une période valide.');
 const next={...store.schoolDates};let count=0,added=0;const end=new Date(to+'T12:00:00');
 for(const d=new Date(from+'T12:00:00');d<=end;d.setDate(d.getDate()+1)){if(++count>366)throw Error('366 jours maximum par période.');if(![0,6].includes(d.getDay())){next[iso(d)]=true;added++;}}
 Timesheet.extras({...store,schoolDates:next});store.schoolDates=next;save();renderSchool();render();$('school-message').textContent=`${added} jour(s) d’école prévus. Aucun crédit ajouté avant confirmation de la semaine.`;
 }catch(error){$('school-message').textContent=error.message;}
};

$('school-import').onclick=()=>$('school-file').click();
$('school-file').onchange=async()=>{
 const file=$('school-file').files[0];if(!file)return;
 try{if(file.size>1000000)throw Error('Fichier trop volumineux.');const parsed=JSON.parse(await file.text()),dates=Array.isArray(parsed)?parsed:parsed.dates;if(!Array.isArray(dates)||dates.some(date=>typeof date!=='string'))throw Error('Le planning doit contenir une liste de dates.');
 const next={...store.schoolDates};for(const date of dates)next[date]=true;Timesheet.extras({...store,schoolDates:next});store.schoolDates=next;save();renderSchool();render();$('school-message').textContent=`Planning importé : ${new Set(dates).size} date(s). Les semaines restent à confirmer après leur réalisation.`;
 }catch(error){$('school-message').textContent='Import impossible : '+error.message;}finally{$('school-file').value='';}
};
