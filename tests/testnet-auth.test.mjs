import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {createLedger} from '../api/ledger.mjs';
import {createTestnetService} from '../api/testnet.mjs';
function cookie(s){return s.split(';')[0]}
async function login(s,w){const c=s.challenge(w.address);const r=s.login({cookie:cookie(c.cookie)},await w.signMessage(c.body.message));return {cookie:cookie(r.cookies[0])}}
test('wallet signature login binds challenge cookie, origin, wallet and expiry; replay denied',async()=>{const l=createLedger();let clock=Date.now();const s=createTestnetService(l.db,{origin:'https://monperks.test',now:()=>clock});const a=Wallet.createRandom(),b=Wallet.createRandom();try{
 const c=s.challenge(a.address),signature=await a.signMessage(c.body.message);assert.match(c.body.message,/monperks.test/);assert.match(c.body.message,/Chain ID: 10143/);
 assert.throws(()=>s.login({cookie:''},signature),/过期/);assert.throws(()=>s.login({cookie:cookie(c.cookie)},b.signingKey.sign('0x'+'11'.repeat(32)).serialized),/签名/);
 const result=s.login({cookie:cookie(c.cookie)},signature);assert.equal(s.account({cookie:cookie(result.cookies[0])}),a.address.toLowerCase());assert.throws(()=>s.login({cookie:cookie(c.cookie)},signature),/过期/);
 s.logout({cookie:cookie(result.cookies[0])});assert.throws(()=>s.account({cookie:cookie(result.cookies[0])}),/登录/);
 const stale=s.challenge(a.address);clock+=300001;assert.throws(()=>s.login({cookie:cookie(stale.cookie)},signature),/过期/);
}finally{l.close()}});
test('server testnet tasks are wallet scoped, idempotent, and not imported from browser points',async()=>{const l=createLedger(),s=createTestnetService(l.db,{origin:'http://localhost:4173'});try{const a=Wallet.createRandom(),b=Wallet.createRandom();const ah=await login(s,a),bh=await login(s,b);assert.equal(s.state(s.account(ah)).points,0);assert.equal(s.checkin(s.account(ah)).points,100);assert.equal(s.checkin(s.account(ah)).awarded,false);assert.equal(s.state(s.account(bh)).points,0);await assert.rejects(()=>s.voucher(s.account(ah),'request_1234567890'),/尚未配置/);assert.equal(s.state(s.account(ah)).points,100)}finally{l.close()}});
test('shared community persists server-side, enforces authorship, and does not award points',async()=>{const l=createLedger(),s=createTestnetService(l.db,{origin:'http://localhost:4173'});try{const a=s.account(await login(s,Wallet.createRandom())),b=s.account(await login(s,Wallet.createRandom()));const p=s.post(a,{title:'共享购物体验',body:'在服务端记录购物心得，给大家参考。'});assert.equal(s.posts().length,1);s.comment(b,{postId:p.id,body:'我也会先看退换条件。'});assert.equal(s.posts()[0].comments.length,1);assert.equal(s.vote(b,p.id).voted,true);assert.equal(s.vote(b,p.id).voted,false);assert.equal(s.posts()[0].votes,0);assert.throws(()=>s.remove(b,p.id),/自己/);assert.throws(()=>s.post(a,{title:'频繁发布测试',body:'重复发布需要限制频率，不奖励积分。'}),/30 秒/);s.report(b,{postId:p.id,reason:'请检查是否包含错误内容'});assert.equal(s.state(a).points,0);s.remove(a,p.id);assert.equal(s.posts().length,0);assert.throws(()=>s.comment(b,{postId:p.id,body:'不能评论已撤回内容'}),/不可用/)}finally{l.close()}});
