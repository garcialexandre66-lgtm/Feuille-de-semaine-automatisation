import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const template=(await readFile('cloudflare/sw-template.js','utf8')).replace('__CACHE_NAME__','"test"').replace('__ASSET_LIST__','[]');
test('push always displays a generic private reminder; tapping focuses or opens the app',async()=>{
 const handlers={},notifications=[],messages=[],opened=[];let focused=false,windows=[];
 const self={location:{origin:'https://asc.test'},addEventListener:(name,handler)=>handlers[name]=handler,registration:{showNotification:async(title,options)=>notifications.push({title,options})},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
 const context=vm.createContext({self,URL,Headers,Response});vm.runInContext(template,context);
 async function dispatch(type,event){let pending;handlers[type]({...event,waitUntil:promise=>pending=promise});await pending;}
 await dispatch('push',{data:{json:()=>({week:'2030-01-07',body:'Ignored untrusted content'})}});
 assert.equal(notifications[0].title,'Feuille de semaine');assert.equal(notifications[0].options.body,'Pense à envoyer ta feuille de semaine');assert.equal(notifications[0].options.renotify,true);
 assert.equal(notifications[0].options.data.url,'/?rappel=2030-01-07');
 let closed=false;const notification={data:notifications[0].options.data,close:()=>closed=true};
 await dispatch('notificationclick',{notification});assert.ok(closed);assert.equal(opened[0],'https://asc.test/?rappel=2030-01-07');
 windows=[{url:'https://asc.test/',postMessage:message=>messages.push(message),focus:async()=>focused=true}];
 await dispatch('notificationclick',{notification});assert.ok(focused);assert.equal(messages[0].week,'2030-01-07');assert.equal(opened.length,1);
 await dispatch('notificationclick',{notification:{data:{url:'https://other.test/'},close(){}}});assert.equal(opened.length,1);
 await dispatch('push',{data:{json:()=>{throw Error('bad')}}});assert.equal(notifications.length,2);
});
