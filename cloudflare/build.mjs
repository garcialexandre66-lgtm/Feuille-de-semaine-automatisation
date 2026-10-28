import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
await cp('cloudflare/assets', 'dist', { recursive: true });
await cp('templates/feuille-semaine.ods', 'dist/modele.ods');
await build({ entryPoints:['cloudflare/export.mjs'], bundle:true, format:'esm', target:'es2022', minify:true, outfile:'dist/cloud-export.js', legalComments:'linked' });
console.log('Application Cloudflare préparée dans dist/.');
