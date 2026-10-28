'use strict';
const CACHE=__CACHE_NAME__;
const ASSETS=__ASSET_LIST__;
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('asc-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Personal API responses and generated exports are never cached.
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/export'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>response.ok?response:caches.match('/index.html',{cacheName:CACHE})).catch(()=>caches.match('/index.html',{cacheName:CACHE})));return;
 }
 if(!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)));}return response;}).catch(()=>caches.match(url.pathname,{cacheName:CACHE})));
});
