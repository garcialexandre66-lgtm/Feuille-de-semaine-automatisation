import { readFile } from 'node:fs/promises';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const id=config.d1_databases?.find(db=>db.binding==='DB')?.database_id;
if(!id||id==='00000000-0000-0000-0000-000000000000'||!/^[-a-f0-9]{36}$/i.test(id)){
 console.error('Créez la base D1 asc-semaines dans Cloudflare, puis remplacez database_id dans wrangler.jsonc par son identifiant. Voir CLOUDFLARE.md.');
 process.exit(1);
}
