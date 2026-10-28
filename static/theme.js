'use strict';
(()=>{
 const get=id=>document.getElementById(id);
 const key='asc-theme-hue-v1';
 let hue=213;
 function rgb(h,s,l){
  const a=s*Math.min(l,1-l);
  return [0,8,4].map(n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));});
 }
 function contrast(h,l){
  const [r,g,b]=rgb((h+360)%360,.75,l).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return 1.05/(.2126*r+.7152*g+.0722*b+.05);
 }
 function apply(value,persist=true){
  hue=((Math.round(Number(value))%360)+360)%360;
  let depth=1;
  while(depth>.4&&[-35,-5,0,5,30].some(offset=>contrast(hue+offset,.5*depth)<4.8))depth-=.025;
  document.documentElement.style.setProperty('--theme-hue',String(hue));
  document.documentElement.style.setProperty('--theme-depth',depth.toFixed(3));
  const [r,g,b]=rgb(hue,.7,.3*depth).map(c=>Math.round(c*255));
  document.querySelector('meta[name="theme-color"]').content='#'+[r,g,b].map(c=>c.toString(16).padStart(2,'0')).join('');
  get('theme-wheel').setAttribute('aria-valuenow',String(hue));
  const name=hue<15||hue>=350?'Rouge':hue<45?'Orange':hue<75?'Jaune':hue<165?'Vert':hue<200?'Turquoise':hue<255?'Bleu':hue<300?'Violet':'Rose';
  get('theme-wheel').setAttribute('aria-valuetext',name);
  get('theme-label').textContent=name;get('theme-range').value=hue;
  if(persist){try{localStorage.setItem(key,String(hue));get('theme-status').textContent='Couleurs enregistrées sur cet appareil.';}catch{get('theme-status').textContent='Couleurs appliquées. Ce navigateur ne permet pas de mémoriser votre choix.';}}
 }
 try{const stored=localStorage.getItem(key);if(stored!==null&&/^\d{1,3}$/.test(stored)&&Number(stored)<360)hue=Number(stored);}catch{}
 apply(hue,false);
 get('theme-open').onclick=()=>get('theme-dialog').showModal();
 for(const id of ['theme-close','theme-done'])get(id).onclick=()=>get('theme-dialog').close();
 get('theme-reset').onclick=()=>apply(213);
 get('theme-range').oninput=event=>apply(event.target.value);
 const wheel=get('theme-wheel');
 function point(event){const rect=wheel.getBoundingClientRect(),x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;if(Math.hypot(x,y)<rect.width*.2)return;apply(Math.atan2(x,-y)*180/Math.PI);}
 wheel.onpointerdown=event=>{if(event.button!==0)return;wheel.focus();wheel.setPointerCapture(event.pointerId);point(event);};
 wheel.onpointermove=event=>{if(wheel.hasPointerCapture(event.pointerId))point(event);};
 wheel.onpointerup=event=>{if(wheel.hasPointerCapture(event.pointerId))wheel.releasePointerCapture(event.pointerId);};
 wheel.onkeydown=event=>{let next;if(['ArrowRight','ArrowUp'].includes(event.key))next=hue+5;if(['ArrowLeft','ArrowDown'].includes(event.key))next=hue-5;if(event.key==='Home')next=0;if(event.key==='End')next=359;if(next!==undefined){event.preventDefault();apply(next);}};
 for(const button of document.querySelectorAll('.theme-presets button')){button.style.setProperty('--preset-color',`hsl(${button.dataset.hue} 65% 40%)`);button.onclick=()=>apply(button.dataset.hue);}
})();
