// Optional end-to-end check: set ASC_PLAYWRIGHT_MODULE and ASC_BROWSER_EXECUTABLE
// when Playwright/Chromium are supplied by the local test runtime.
import { build } from 'esbuild';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { readFile,readdir,mkdir } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.ASC_PLAYWRIGHT_MODULE?pathToFileURL(process.env.ASC_PLAYWRIGHT_MODULE).href:'playwright');
const root=resolve('dist'),setupToken=crypto.randomUUID()+crypto.randomUUID();
let assetVersion=0;
const bundled=await build({entryPoints:['cloudflare/worker.mjs'],bundle:true,format:'esm',write:false});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.pdf':'application/pdf','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-28',d1Databases:['DB'],bindings:{SETUP_TOKEN:setupToken},serviceBindings:{ASSETS:async request=>{
 const pathname=new URL(request.url).pathname,file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+sep))return new Response('Missing',{status:404});
 try{let content=await readFile(file);if(pathname==='/sw.js')content=Buffer.from(content.toString()+`\n// Test version ${assetVersion}`);if(pathname==='/simple.js')content=Buffer.from(content.toString()+`\nwindow.testAssetVersion=${assetVersion};`);return new Response(content,{headers:{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}});}catch{return new Response('Missing',{status:404});}
}}}));
let browser;
try{
 const db=await mf.getD1Database('DB');for(const file of (await readdir('cloudflare/migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('cloudflare/migrations/'+file,'utf8')).split(';').filter(x=>x.trim()))await db.prepare(sql).run();
 const origin=(await mf.ready).href;
 browser=await chromium.launch({headless:true,...(process.env.ASC_BROWSER_EXECUTABLE?{executablePath:process.env.ASC_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'fr-FR'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.locator('#cloud-setup').waitFor({state:'visible'});
 await page.locator('#setup-token').fill(setupToken);await page.locator('#new-code').fill('test-only-refresh-code');await page.locator('#confirm-code').fill('test-only-refresh-code');await page.locator('#cloud-setup-form button').click();
 await page.locator('#access-code').fill('test-only-refresh-code');await page.locator('#login-form button').click();await page.locator('#application').waitFor({state:'visible'});
 await page.locator('#settings-open').click();await page.locator('#name').fill('Test actualisation');await page.locator('#settings-close').click();
 await page.waitForFunction(()=>cacheSaved&&!dirty);
 await page.evaluate(()=>{week='2026-10-26';store.weeks[week]=Array.from({length:7},(_,i)=>i<5?[{client:'Atelier ASC',workplace:'atelier',city:'',travel:0,tpe:420,regie:0,chantier:0,sav:0}]:[]);save();render();});
 await page.waitForFunction(()=>cacheSaved&&!dirty);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const before=await page.evaluate(()=>performance.timeOrigin);await page.locator('#refresh-app').click();
 await page.waitForFunction(t=>performance.timeOrigin!==t,before);await page.locator('#application').waitFor({state:'visible'});
 assert.equal(await page.locator('#login-panel').isVisible(),false);assert.equal(await page.evaluate(()=>store.name),'Test actualisation');
 assert.equal(await page.evaluate(()=>Object.hasOwn(store.weeks,'2026-10-26')),true);
 assetVersion=1;await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});await page.locator('#update-ready').waitFor({state:'visible'});
 const updateOrigin=await page.evaluate(()=>performance.timeOrigin);await page.locator('#reload-app').click();await page.waitForFunction(t=>performance.timeOrigin!==t,updateOrigin);await page.locator('#application').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>window.testAssetVersion),1);assert.equal(await page.evaluate(()=>store.name),'Test actualisation');
 // A second tab still requires the existing code; no persistent unlock key is introduced.
 const second=await context.newPage();await second.goto(origin);await second.locator('#login-panel').waitFor({state:'visible'});await second.close();
 assert.equal(await page.evaluate(async()=>{const request=indexedDB.open('asc-private-offline',1);return await new Promise(resolve=>{request.onsuccess=()=>{const req=request.result.transaction('records').objectStore('records').getAllKeys();req.onsuccess=()=>resolve(req.result.includes('trusted-key'));};});}),false);
 // An unrecorded line is protected when refresh is cancelled.
 await page.locator('#week-cards > .week-card > summary').first().click();await page.locator('#add').click();await page.locator('#form [name=client]').fill('Brouillon à conserver');
 page.once('dialog',dialog=>dialog.dismiss());const draftOrigin=await page.evaluate(()=>performance.timeOrigin);await page.evaluate(()=>$('refresh-app').click());
 assert.equal(await page.evaluate(()=>performance.timeOrigin),draftOrigin);assert.equal(await page.locator('#form [name=client]').inputValue(),'Brouillon à conserver');await page.locator('#cancel').click();await page.locator('#week-cards > .week-card > summary').first().click();
 // Real encrypted pending edits survive an offline refresh in the same tab.
 await context.setOffline(true);await page.locator('#settings-open').click();await page.locator('#name').fill('Modification hors ligne');await page.locator('#settings-close').click();await page.waitForFunction(()=>cacheSaved&&dirty);
 const offlineOrigin=await page.evaluate(()=>performance.timeOrigin);await page.locator('#refresh-app').click();await page.waitForFunction(t=>performance.timeOrigin!==t,offlineOrigin);await page.locator('#application').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>store.name),'Modification hors ligne');assert.equal(await page.evaluate(()=>dirty),true);
 await context.setOffline(false);await page.waitForFunction(()=>connected&&!dirty);
 // Desktop Gmail path: draft is addressed correctly; PDF downloads; no mail is sent.
 let gmailUrl='';await context.route('https://mail.google.com/**',route=>{gmailUrl=route.request().url();return route.fulfill({contentType:'text/html',body:'Gmail compose test'});});
 await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true}));
 await page.locator('#gmail-pdf').click();if(await page.locator('#review-dialog').isVisible())await page.locator('#review-download').click();await page.locator('#gmail-dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#gmail-native-share').isVisible(),false);
 const expectedBody='Bonjour,\nVoici ma feuille de semaine en piece jointe.\nGarcia Alexandre';
 assert.equal(await page.locator('.gmail-body-preview').innerText(),expectedBody);
 await mkdir('../refresh-proof',{recursive:true});await page.screenshot({path:'../refresh-proof/gmail-draft.png',fullPage:true});
 const appUrl=new URL(await page.locator('#gmail-app-compose').getAttribute('href'));
 assert.equal(appUrl.protocol,'mailto:');assert.equal(appUrl.pathname,'s.sanchez@asc66.fr');assert.equal(appUrl.searchParams.get('body').replace(/\r\n/g,'\n'),expectedBody);
 await page.evaluate(()=>$('gmail-app-compose').addEventListener('click',event=>event.preventDefault(),{once:true}));
 const appDownload=page.waitForEvent('download');await page.locator('#gmail-app-compose').click();assert.equal((await appDownload).suggestedFilename(),'Semaine du 26-10-2026 au 30-10-2026.pdf');
 const popupPromise=context.waitForEvent('page'),downloadPromise=page.waitForEvent('download');await page.locator('#gmail-compose').click();const [popup,download]=await Promise.all([popupPromise,downloadPromise]);await popup.waitForLoadState();
 assert.equal(new URL(gmailUrl).searchParams.get('to'),'s.sanchez@asc66.fr');assert.equal(new URL(gmailUrl).searchParams.get('body'),expectedBody);assert.match(new URL(gmailUrl).searchParams.get('su'),/26-10-2026 au 30-10-2026/);assert.equal(download.suggestedFilename(),'Semaine du 26-10-2026 au 30-10-2026.pdf');await popup.close();
 await page.locator('#gmail-dialog').getByRole('button',{name:'Fermer',exact:true}).click();
 // Native sharing path is invoked only by a second, explicit user action.
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async data=>{window.testShare={file:data.files[0].name,bytes:data.files[0].size,text:data.text};},configurable:true});});
 await page.locator('#gmail-pdf').click();if(await page.locator('#review-dialog').isVisible())await page.locator('#review-download').click();await page.locator('#gmail-share-options summary').click();await page.locator('#gmail-native-share').waitFor({state:'visible'});await page.locator('#gmail-native-share').click();
 const shared=await page.evaluate(()=>window.testShare);assert.ok(shared.bytes>1000);assert.equal(shared.text,expectedBody);assert.equal(shared.text.includes('s.sanchez'),false);await page.locator('#gmail-dialog').getByRole('button',{name:'Fermer',exact:true}).click();
 await mkdir('../refresh-proof',{recursive:true});await page.screenshot({path:'../refresh-proof/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('OK: same-tab refresh preserves session and encrypted edits; new tab remains locked; draft cancel protected; offline edits survive; Gmail compose/download and native sharing verified without sending mail.');
}finally{await browser?.close();await mf.dispose();}
