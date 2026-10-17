import {readFile,writeFile} from 'node:fs/promises';
const vendor=await readFile('node_modules/ethers/dist/ethers.umd.min.js','utf8');
const source=(await readFile('web/testnet.mjs','utf8')).replace(/^import \{([^}]+)\} from 'ethers';/, 'const {$1}=window.ethers;');
await writeFile('dist/testnet.js',vendor+'\n;(function(){\n'+source+'\n})();\n');
const {readdir}=await import('node:fs/promises');
const licenses=[];
for(const dir of ['node_modules/ethers','node_modules/@openzeppelin/contracts']){const name=(await readdir(dir)).find(n=>/^LICENSE/i.test(n));if(name)licenses.push(dir+'\n\n'+await readFile(dir+'/'+name,'utf8'))}
await writeFile('dist/THIRD-PARTY-NOTICES.txt',licenses.join('\n\n--------------------\n\n'));
console.log('Testnet wallet client bundled locally; no CDN dependency.');
