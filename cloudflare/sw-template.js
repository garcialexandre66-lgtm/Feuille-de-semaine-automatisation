'use strict';
const CACHE=__CACHE_NAME__;
const ASSETS=__ASSET_LIST__;
async function withoutRedirect(response){
 if(!response||!response.redirected)return response;
 // Safari rejects a redirected cached response for a navigation with redirect=manual.
 const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
 return new Response(await response.arrayBuffer(),{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('asc-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Personal API responses and generated exports are never cached.
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/export'))return;
 if(request.mode==='navigate'){
  // Keep HTML and scripts in one installed version, even during a deployment.
  event.respondWith(caches.match('/index.html',{cacheName:CACHE}).then(cached=>cached||fetch(request,{cache:'no-store'})).then(withoutRedirect));return;
 }
 if(!ASSETS.includes(url.pathname))return;
 event.respondWith(caches.match(url.pathname,{cacheName:CACHE}).then(cached=>cached||fetch(request,{cache:'no-store'}).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)));}return response;})).then(withoutRedirect));
});
