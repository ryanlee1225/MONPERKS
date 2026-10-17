import { access,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
for(const file of ['dist/index.html','dist/app.js','dist/adapters.js','dist/community.js','dist/community.css','dist/style.css','dist/config.js','dist/favicon.svg','dist/testnet.js','dist/testnet.css','dist/contracts.json'])await access(resolve(file));
let hosting;
try {hosting=await readFile('.openai/hosting.json','utf8')} catch(e){if(e.code!=='ENOENT')throw e}
if(hosting){const config=JSON.parse(hosting);if(!config.project_id||config.static?.directory!=='dist')throw Error('Invalid hosting manifest')}
await writeFile('dist/robots.txt','User-agent: *\nDisallow: /\n');
await writeFile('dist/.nojekyll','');
console.log('Static demo build ready. Live settlement remains disabled.');
