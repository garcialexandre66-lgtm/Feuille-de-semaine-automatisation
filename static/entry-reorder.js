'use strict';
// Keep ordinary scrolling available; only a held row starts a drag.
function setupEntryReorder(){
 const list=$('entries'),rows=[...list.querySelectorAll(':scope > .entry')];
 if(rows.length<2)return;
 rows.forEach((row,index)=>{
  row.dataset.entryIndex=String(index);
  const grip=node('button','⠿','entry-grip');grip.type='button';
  grip.setAttribute('aria-label','Déplacer '+(days()[selected][index].client||'cette ligne'));
  grip.title='Maintenir et glisser pour déplacer · flèches haut et bas au clavier';
  grip.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown');row.prepend(grip);
  let timer=null,active=false,ghost=null,startX=0,startY=0,lastY=0,frame=0,offset=0;
  const savedWeek=week,savedDay=selected,original=JSON.stringify(days()[selected]);
  const mouseMove=event=>{if(event.pointerType!=='touch')move(event.clientX,event.clientY,event);};
  const mouseEnd=event=>{if(event.pointerType==='touch')return;if(active)commit();else cleanup();};
  const cleanup=()=>{window.removeEventListener('pointermove',mouseMove);window.removeEventListener('pointerup',mouseEnd);clearTimeout(timer);timer=null;cancelAnimationFrame(frame);ghost?.remove();ghost=null;row.classList.remove('entry-drag-source');document.body.classList.remove('entry-dragging');active=false;};
  const commit=()=>{
   const order=[...list.querySelectorAll(':scope > .entry')].map(el=>Number(el.dataset.entryIndex));
   const changed=order.some((value,i)=>value!==i);
   cleanup();
   if(!changed)return;
   if(week!==savedWeek||selected!==savedDay||JSON.stringify(days()[selected])!==original){render();return;}
   const day=days()[selected];store.weeks[week][selected]=order.map(i=>day[i]);save();render();
   const moved=list.querySelector('[data-entry-index="'+order.indexOf(index)+'"] .entry-grip');moved?.focus({preventScroll:true});
  };
  const place=y=>{
   if(!active)return;lastY=y;ghost.style.top=(y-offset)+'px';
   const others=[...list.querySelectorAll(':scope > .entry')].filter(el=>el!==row);
   const before=others.find(el=>{const box=el.getBoundingClientRect();return y<box.top+box.height/2;});
   if(before)list.insertBefore(row,before);else list.append(row);
  };
  const scroll=()=>{
   if(!active)return;
   if(!row.isConnected){cleanup();return;}
   const edge=80,delta=lastY<edge?-Math.ceil((edge-lastY)/6):lastY>innerHeight-edge?Math.ceil((lastY-innerHeight+edge)/6):0;
   if(delta){window.scrollBy(0,delta);place(lastY);}frame=requestAnimationFrame(scroll);
  };
  const begin=()=>{
   timer=null;if(!row.isConnected||week!==savedWeek||selected!==savedDay)return;
   active=true;const box=row.getBoundingClientRect();offset=Math.min(Math.max(startY-box.top,0),box.height);
   ghost=row.cloneNode(true);ghost.classList.add('entry-drag-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
   Object.assign(ghost.style,{left:box.left+'px',width:box.width+'px',top:box.top+'px'});document.body.append(ghost);
   row.classList.add('entry-drag-source');document.body.classList.add('entry-dragging');lastY=startY;frame=requestAnimationFrame(scroll);
  };
  const start=(x,y)=>{startX=x;startY=y;clearTimeout(timer);timer=setTimeout(begin,350);};
  const move=(x,y,event)=>{if(!active){if(Math.hypot(x-startX,y-startY)>8){clearTimeout(timer);timer=null;}return;}event.preventDefault();place(y);};
  row.addEventListener('touchstart',event=>{
   if(event.touches.length!==1||event.target.closest('button:not(.entry-grip),input,a'))return;
   const touch=event.touches[0];start(touch.clientX,touch.clientY);
  },{passive:true});
  row.addEventListener('touchmove',event=>{if(event.touches.length!==1){cleanup();render();return;}const touch=event.touches[0];move(touch.clientX,touch.clientY,event);},{passive:false});
  row.addEventListener('touchend',()=>{if(active)commit();else cleanup();});
  row.addEventListener('touchcancel',()=>{const wasActive=active;cleanup();if(wasActive)render();});
  row.addEventListener('contextmenu',event=>{if(active||timer)event.preventDefault();});
  row.addEventListener('pointerdown',event=>{
   if(event.pointerType==='touch'||event.button!==0||event.target.closest('button:not(.entry-grip),input,a'))return;
   window.addEventListener('pointermove',mouseMove,{passive:false});window.addEventListener('pointerup',mouseEnd);start(event.clientX,event.clientY);
  });
  row.addEventListener('pointercancel',event=>{if(event.pointerType==='touch')return;const wasActive=active;cleanup();if(wasActive)render();});
  grip.onclick=event=>event.preventDefault();
  grip.onkeydown=event=>{
   if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
   const target=index+(event.key==='ArrowUp'?-1:1);if(target<0||target>=rows.length)return;
   list.insertBefore(row,event.key==='ArrowUp'?rows[target]:rows[target].nextSibling);commit();
  };
 });
}
