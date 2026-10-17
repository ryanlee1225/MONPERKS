import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BrowserProvider,ContractFactory,Wallet,parseEther,verifyTypedData} from 'ethers';
import {createLedger} from '../api/ledger.mjs';
import {createTestnetService,claimTypes} from '../api/testnet.mjs';

test('complete local-chain flow: server points → voucher → funded contract → verified receipt; rejects fraud and replay',async()=>{
 const {network}=await import('hardhat');const connection=await network.connect('test');
 const provider=new BrowserProvider(connection.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=20;
 const ledger=createLedger(),rewardSigner=Wallet.createRandom();
 try{
  const owner=await provider.getSigner(0),recipient=await provider.getSigner(1),other=await provider.getSigner(2),address=(await recipient.getAddress()).toLowerCase();
  const artifacts=JSON.parse(readFileSync('dist/contracts.json','utf8'));
  const token=await new ContractFactory(artifacts.DemoRewardToken.abi,artifacts.DemoRewardToken.bytecode,owner).deploy();await token.waitForDeployment();
  const reward=await new ContractFactory(artifacts.RewardDistributor.abi,artifacts.RewardDistributor.bytecode,owner).deploy(await token.getAddress(),rewardSigner.address,await owner.getAddress(),parseEther('10'));await reward.waitForDeployment();
  assert.equal(await reward.paused(),true);await (await token.transfer(await reward.getAddress(),parseEther('1'))).wait();await (await reward.unpause()).wait();
  const service=createTestnetService(ledger.db,{origin:'https://local.test',chainId:1337,signerKey:rewardSigner.privateKey,provider,deployment:()=>({token:token.target,distributor:reward.target})});
  const c=service.challenge(address);const login=service.login({cookie:c.cookie.split(';')[0]},await recipient.signMessage(c.body.message));const logged=service.account({cookie:login.cookies[0].split(';')[0]});service.checkin(logged);
  const v=await service.voucher(logged,'chain_request_00001');assert.equal(service.state(logged).points,0);const retry=await service.voucher(logged,'chain_request_00001');assert.equal(retry.claim_id,v.claim_id);assert.equal(service.state(logged).points,0);
  assert.equal(verifyTypedData({name:'MONPERKS Rewards',version:'1',chainId:1337,verifyingContract:reward.target},claimTypes,v.claim,v.signature),rewardSigner.address);
  await assert.rejects(()=>reward.connect(other).claim(v.claim.claimId,address,v.claim.amount,v.claim.deadline,v.signature));
  await assert.rejects(()=>reward.connect(recipient).claim(v.claim.claimId,address,parseEther('2'),v.claim.deadline,v.signature));
  await assert.rejects(()=>reward.connect(recipient).claim(v.claim.claimId,address,v.claim.amount,1,v.signature));
  const wrongDomain=await rewardSigner.signTypedData({name:'MONPERKS Rewards',version:'1',chainId:10143,verifyingContract:reward.target},claimTypes,v.claim);
  await assert.rejects(()=>reward.connect(recipient).claim(v.claim.claimId,address,v.claim.amount,v.claim.deadline,wrongDomain));
  const tx=await reward.connect(recipient).claim(v.claim.claimId,address,v.claim.amount,v.claim.deadline,v.signature);await tx.wait();await provider.send('evm_mine',[]);
  assert.equal(await token.balanceOf(address),parseEther('1'));assert.equal(await reward.consumed(v.claim_id),true);
  await assert.rejects(()=>reward.connect(recipient).claim(v.claim.claimId,address,v.claim.amount,v.claim.deadline,v.signature));
  await assert.rejects(()=>service.confirm(logged,v.claim_id,'0x'+'11'.repeat(32)),/尚未/);
  // Reconciliation must still work when the reward pool is empty or paused.
  await (await reward.pause()).wait();const result=await service.confirm(logged,v.claim_id,tx.hash);assert.equal(result.status,'claimed');assert.equal((await service.confirm(logged,v.claim_id,tx.hash)).status,'claimed');
  assert.equal(service.state(logged).points,0);assert.equal(service.state(logged).claims.length,1);
  await (await token.transfer(reward.target,parseEther('1'))).wait();await (await reward.unpause()).wait();
  const otherAddress=(await other.getAddress()).toLowerCase(),challenge=service.challenge(otherAddress);
  const otherLogin=service.login({cookie:challenge.cookie.split(';')[0]},await other.signMessage(challenge.body.message));const otherAccount=service.account({cookie:otherLogin.cookies[0].split(';')[0]});
  service.checkin(otherAccount);const expiring=await service.voucher(otherAccount,'expiring_request_001');
  await assert.rejects(()=>service.cancelExpired(otherAccount,expiring.claim_id),/finalized/);
  await provider.send('evm_increaseTime',[7200]);await provider.send('hardhat_mine',['0x40']);
  const cancelled=await service.cancelExpired(otherAccount,expiring.claim_id);assert.equal(cancelled.status,'cancelled');assert.equal(service.state(otherAccount).points,100);
  await service.cancelExpired(otherAccount,expiring.claim_id);assert.equal(service.state(otherAccount).points,100);
 }finally{ledger.close();provider.destroy();await connection.close()}
});
