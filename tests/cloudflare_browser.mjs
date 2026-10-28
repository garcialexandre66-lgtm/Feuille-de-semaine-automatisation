import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, extname } from 'node:path';
const setupToken=crypto.randomUUID()+crypto.randomUUID();
const bundled=await build({entryPoints:['cloudflare/worker.mjs'],bundle:true,format:'esm',write:false});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.pdf':'application/pdf','.ttf':'font/ttf','.ods':'application/vnd.oasis.opendocument.spreadsheet','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const mf=new Miniflare(convertV4MiniflareOptions({
 modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-28',d1Databases:['DB'],bindings:{SETUP_TOKEN:setupToken},
 serviceBindings:{ASSETS:async request=>{
  const path=new URL(request.url).pathname;
  const file=resolve('dist','.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(resolve('dist')+'/'))return new Response('Missing',{status:404});
  try{return new Response(await readFile(file),{headers:{'Content-Type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('Missing',{status:404});}
 }}
}));
try{
 const db=await mf.getD1Database('DB');
 for(const sql of (await readFile('cloudflare/migrations/0001_initial.sql','utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 const url=await mf.ready;
 await mkdir('apercus',{recursive:true});
 const child=spawn('python3',['tests/cloudflare_browser.py'],{stdio:'inherit',env:{...process.env,ASC_TEST_URL:url.href,ASC_TEST_SETUP:setupToken}});
 const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
 if(code)process.exitCode=code;
}finally{await mf.dispose();}
