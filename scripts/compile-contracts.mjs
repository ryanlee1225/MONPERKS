import solc from 'solc';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const files=['contracts/src/RewardDistributor.sol','contracts/test/RewardDistributor.t.sol','contracts/src/DemoRewardToken.sol'];
const input={language:'Solidity',sources:Object.fromEntries(files.map(f=>[f,{content:readFileSync(f,'utf8')}])),settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input),{import:f=>{try{return {contents:readFileSync(f.startsWith('@openzeppelin/')?path.join('node_modules',f):f,'utf8')}}catch{return {error:'Import unavailable: '+f}}}}));
const errors=(output.errors||[]).filter(e=>e.severity==='error');
if(errors.length){errors.forEach(e=>console.error(e.formattedMessage));process.exit(1)}
mkdirSync('contracts/artifacts',{recursive:true});
const result=output.contracts[files[0]].RewardDistributor;
writeFileSync('contracts/artifacts/RewardDistributor.json',JSON.stringify({compiler:solc.version(),abi:result.abi,bytecode:'0x'+result.evm.bytecode.object},null,2));
console.log('RewardDistributor and Foundry test sources compile with Solidity '+solc.version());
console.log('Contract bytecode: '+result.evm.bytecode.object.length/2+' bytes. No deployment performed.');
const demo=output.contracts[files[2]].DemoRewardToken;
writeFileSync('dist/contracts.json',JSON.stringify({RewardDistributor:{abi:result.abi,bytecode:'0x'+result.evm.bytecode.object},DemoRewardToken:{abi:demo.abi,bytecode:'0x'+demo.evm.bytecode.object}}));
