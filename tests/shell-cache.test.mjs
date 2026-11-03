import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../cloudflare/sw-template.js',import.meta.url),'utf8')).replace('__CACHE_NAME__',JSON.stringify('audit-v1')).replace('__ASSET_LIST__',JSON.stringify(['/index.html','/polish.js']));
function harness(cached){
 const handlers={},requests=[];
 const context=vm.createContext({self:{location:{origin:'https://app.test'},addEventListener:(type,fn)=>handlers[type]=fn},caches:{match:async key=>cached[key],open:async()=>({put:async()=>{}})},fetch:async request=>{requests.push(request.url);return new Response('network',{status:200});},Response,URL});vm.runInContext(source,context);
 return {requests,fetch:async(path,mode='cors',method='GET')=>{let response;handlers.fetch({request:{url:'https://app.test'+path,method,mode},respondWith:value=>response=value,waitUntil:()=>{}});return await response;}};
}
test('the installed shell uses matching cached HTML and scripts during a deployment',async()=>{
 const app=harness({'/index.html':new Response('HTML v1'),'/polish.js':new Response('JS v1')});
 assert.equal(await (await app.fetch('/','navigate')).text(),'HTML v1');assert.equal(await (await app.fetch('/polish.js')).text(),'JS v1');assert.equal(app.requests.length,0);
});
test('uncached resources can use the network; personal API and exports never enter the shell cache',async()=>{
 const app=harness({});assert.equal(await (await app.fetch('/polish.js')).text(),'network');assert.equal(await app.fetch('/api/state'),undefined);assert.equal(await app.fetch('/export/pdf'),undefined);assert.equal(await app.fetch('/api/state','cors','POST'),undefined);assert.equal(app.requests.length,1);
});
