import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
const fields=['travel','tpe','regie','chantier','sav'];
const duration=m=>m?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`:'';
const total=item=>fields.reduce((n,key)=>n+item[key],0);
const dateText=value=>{const d=new Date(value+'T12:00:00');return d.toLocaleDateString('fr-FR');};
async function asset(path){const response=await fetch(path);if(!response.ok)throw Error('Le modèle d’export est indisponible.');return new Uint8Array(await response.arrayBuffer());}
export async function createPdf(data){
 const [background,fontBytes]=await Promise.all([asset('/modele.pdf'),asset('/texte.ttf')]);
 const pdf=await PDFDocument.load(background);pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(fontBytes,{subset:true});
 const glyphs=new Set(font.getCharacterSet());
 const safe=value=>Array.from(String(value).replace(/[\r\n\t]/g,' '),c=>glyphs.has(c.codePointAt(0))?c:'?').join('');
 const page=pdf.getPage(0),height=page.getHeight();
 function text(value,x,top,width,size=6.3){if(!value)return;const content=safe(value),measured=font.widthOfTextAtSize(content,size);const scaled=measured>width?size*width/measured:size;page.drawText(content,{x,y:height-top-scaled,size:scaled,font,color:rgb(0,0,0)});}
 const end=new Date(data.week+'T12:00:00');end.setDate(end.getDate()+6);
 const endText=end.toLocaleDateString('fr-FR');
 text(`Nom du technicien : ${data.name}`,18.25,53.5,126,7);
 text(`Semaine du ${dateText(data.week)} au ${endText}`,18.25,67.4,126,6.5);
 // Coordinates measured on the original ASC model, fitted to one A4 page.
 const columns=[52.166,138.263,191.282,233.804,273.688,293.630,313.571,328.791,344.010,360.281,380.222,400.164];
 let cumulative=0;
 data.days.forEach((day,dayIndex)=>{
  day.forEach((item,index)=>{
   const minutes=total(item),overtime=Math.max(0,cumulative+minutes-2100)-Math.max(0,cumulative-2100);cumulative+=minutes;
   const values=[item.client,item.city,'','',item.travel?String(item.travel):'',...fields.slice(1).map(k=>duration(item[k])),duration(minutes),duration(overtime)];
   const top=105.8+(dayIndex*8+index)*12.481;
   values.forEach((value,i)=>text(value,columns[i]+1,top,columns[i+1]-columns[i]-2));
  });
 });
 pdf.setTitle(`Feuille de semaine du ${dateText(data.week)}`);pdf.setAuthor(data.name);pdf.setCreator('Ma feuille de semaine · ASC Electronique');
 return new Blob([await pdf.save()],{type:'application/pdf'});
}
export async function createOds(data){
 const files=unzipSync(await asset('/modele.ods'));
 const ns={table:'urn:oasis:names:tc:opendocument:xmlns:table:1.0',office:'urn:oasis:names:tc:opendocument:xmlns:office:1.0',text:'urn:oasis:names:tc:opendocument:xmlns:text:1.0'};
 const xml=new DOMParser().parseFromString(strFromU8(files['content.xml']),'application/xml');
 if(xml.querySelector('parsererror'))throw Error('Le modèle ODS est invalide.');
 const sheet=xml.getElementsByTagNameNS(ns.table,'table')[0];
 const rows=Array.from(sheet.children).filter(el=>el.localName==='table-row');
 function cells(row){const result=[];for(const cell of Array.from(row.children)){
  cell.remove();const count=Number(cell.getAttributeNS(ns.table,'number-columns-repeated')||1),used=Math.min(count,Math.max(0,13-result.length));
  for(let i=0;i<used;i++){const el=cell.cloneNode(true);el.removeAttributeNS(ns.table,'number-columns-repeated');row.append(el);result.push(el);}
  if(count>used){cell.setAttributeNS(ns.table,'table:number-columns-repeated',count-used);row.append(cell);}
 }return result;}
 function put(cell,value){cell.replaceChildren();for(const attr of Array.from(cell.attributes))if(attr.namespaceURI===ns.office||(attr.namespaceURI===ns.table&&attr.localName==='formula'))cell.removeAttributeNS(attr.namespaceURI,attr.localName);
  if(value){cell.setAttributeNS(ns.office,'office:value-type','string');const p=xml.createElementNS(ns.text,'text:p');p.textContent=value;cell.append(p);}
 }
 put(cells(rows[1])[0],`Nom du technicien : ${data.name}`);
 const end=new Date(data.week+'T12:00:00');end.setDate(end.getDate()+6);
 put(cells(rows[2])[0],`Semaine du ${dateText(data.week)} au ${end.toLocaleDateString('fr-FR')}`);
 let cumulative=0;
 data.days.forEach((day,dayIndex)=>{day.forEach((item,index)=>{
  const minutes=total(item),extra=Math.max(0,cumulative+minutes-2100)-Math.max(0,cumulative-2100);cumulative+=minutes;
  const values=[item.client,item.city,'','',item.travel?String(item.travel):'',...fields.slice(1).map(k=>duration(item[k])),duration(minutes),duration(extra)];
  const line=cells(rows[5+dayIndex*8+index]);values.forEach((value,i)=>put(line[i+2],value));
 });});
 files['content.xml']=strToU8(new XMLSerializer().serializeToString(xml));
 // ODF requires the mimetype entry first and stored without compression.
 const {mimetype,...rest}=files;
 return new Blob([zipSync({mimetype:[mimetype,{level:0}],...rest})],{type:'application/vnd.oasis.opendocument.spreadsheet'});
}
