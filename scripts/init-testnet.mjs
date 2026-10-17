import {Wallet} from 'ethers';
import {writeFile,access} from 'node:fs/promises';
const file=new URL('../api/testnet-signer.secret.json',import.meta.url);
try{await access(file);console.log('Existing testnet signing key preserved.')}catch{const wallet=Wallet.createRandom();await writeFile(file,JSON.stringify({purpose:'testnet-voucher-signing-only',privateKey:wallet.privateKey}),{flag:'wx',mode:0o600});console.log('Created dedicated testnet voucher signer. Public address:',wallet.address)}
console.log('No wallet funds are controlled by this development key. Never commit *.secret.json.');
