import { createHash } from 'node:crypto';
import { cp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
await cp('cloudflare/assets', 'dist', { recursive: true });
await cp('templates/feuille-semaine.ods', 'dist/modele.ods');
await build({ entryPoints:['cloudflare/export.mjs'], bundle:true, format:'esm', target:'es2022', minify:true, outfile:'dist/cloud-export.js', legalComments:'linked' });
const assets=[];
async function walk(path='dist') { for(const entry of await readdir(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())await walk(file);else if(!entry.name.startsWith('_')&&!entry.name.endsWith('.txt'))assets.push('/'+file.slice(5));} }
await walk();assets.sort();
const digest=createHash('sha256');for(const asset of assets){digest.update(asset);digest.update(await readFile('dist'+asset));}
const cache='asc-shell-'+digest.digest('hex').slice(0,16);
const sw=(await readFile('cloudflare/sw-template.js','utf8')).replace('__CACHE_NAME__',JSON.stringify(cache)).replace('__ASSET_LIST__',JSON.stringify(assets));
await writeFile('dist/sw.js',sw);
console.log('Application Cloudflare préparée dans dist/.');
