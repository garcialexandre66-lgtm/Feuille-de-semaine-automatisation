import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {spawn} from 'node:child_process';
const setupToken=crypto.randomUUID()+crypto.randomUUID(),bundled=await build({entryPoints:['cloudflare/worker.mjs'],bundle:true,format:'esm',write:false});
const fixed=await readFile('dist/sw.js','utf8'),assets=JSON.parse(fixed.match(/const ASSETS=(\[.*\]);/)[1]);
const broken=`const CACHE='asc-shell-broken';const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.pathname.startsWith('/api/'))return;if(e.request.mode==='navigate')e.respondWith(caches.match('/index.html',{cacheName:CACHE}));});`;
let upgraded=false,assetsOffline=false;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.pdf':'application/pdf','.ttf':'font/ttf','.ods':'application/vnd.oasis.opendocument.spreadsheet','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
// This fixture runs on loopback HTTP. Safari requires HTTPS for a Secure cookie;
// remove only that flag in the test bundle, never in the production worker.
const localScript=bundled.outputFiles[0].text.replaceAll('HttpOnly; Secure;','HttpOnly;');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:localScript,compatibilityDate:'2026-10-28',d1Databases:['DB'],bindings:{SETUP_TOKEN:setupToken},serviceBindings:{ASSETS:async request=>{
 const path=new URL(request.url).pathname;
 if(path==='/__test-upgrade'){upgraded=true;return new Response('ok');}
 if(path==='/__test-offline'){assetsOffline=true;return new Response('ok');}
 if(assetsOffline)return new Response('Offline fixture',{status:503});
 if(path==='/index.html')return Response.redirect(new URL('/',request.url),307);
 if(path==='/sw.js')return new Response(upgraded?fixed:broken,{headers:{'Content-Type':types['.js'],'Cache-Control':'no-cache'}});
 const file=resolve('dist','.'+(path==='/'?'/index.html':path));if(!file.startsWith(resolve('dist')+'/'))return new Response('Missing',{status:404});
 try{return new Response(await readFile(file),{headers:{'Content-Type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('Missing',{status:404});}
}}}));
try{
 const db=await mf.getD1Database('DB');for(const name of ['0001_initial.sql','0002_delivery.sql'])for(const sql of (await readFile('cloudflare/migrations/'+name,'utf8')).split(';').filter(x=>x.trim()))await db.prepare(sql).run();
 await mkdir('apercus',{recursive:true});const url=await mf.ready;
 const child=spawn('python3',['tests/safari_recovery_browser.py'],{stdio:'inherit',env:{...process.env,ASC_TEST_URL:url.href,ASC_TEST_SETUP:setupToken}});const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});if(code)process.exitCode=code;
}finally{await mf.dispose();}
