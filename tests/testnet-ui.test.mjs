import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import * as ethers from 'ethers';
async function setup(available){const dom=new JSDOM(readFileSync('dist/index.html','utf8'),{url:'https://demo.test/#testnet',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.scrollTo=()=>{};w.crypto.randomUUID=randomUUID;w.ethers=ethers;
 w.fetch=async url=>{if(!available)throw Error('后台不可用');const path=new URL(url).pathname;const data=path.endsWith('/config')?{chainId:10143,configured:false,signerAddress:'0x1111111111111111111111111111111111111111'}:path.endsWith('/account')?{address:'0x2222222222222222222222222222222222222222',points:100,claims:[],tasks:[]}:{posts:[{id:'one',address:'0x1111111111111111111111111111111111111111',title:'<img src=x onerror=alert(1)>',body:'服务端内容应作为普通文字显示。',created_at:'2026-10-17',votes:0,comments:[]}]};return {ok:true,json:async()=>data}};
 for(const file of ['config','adapters','app','community'])w.eval(readFileSync(`dist/${file}.js`,'utf8'));
 w.eval(readFileSync('web/testnet.mjs','utf8').replace(/^import \{([^}]+)\} from 'ethers';/,'const {$1}=window.ethers;'));
 await new Promise(r=>setTimeout(r,10));return {dom,w,d:w.document,route:p=>{w.location.hash=p;w.dispatchEvent(new w.HashChangeEvent('hashchange'))}}}
test('testnet UI uses server points, disables unconfigured payouts, and escapes shared content',async()=>{const a=await setup(true);try{assert.match(a.d.querySelector('#main').textContent,/服务端测试积分/);assert.match(a.d.querySelector('#main .stat-card strong').textContent,/100/);assert.equal(a.d.querySelector('[data-chain="claim"]').disabled,true);assert.equal(a.w.MONPERKS_APP.getState().points,1250);a.route('shared');assert.equal(a.d.querySelector('#main img'),null);assert.match(a.d.querySelector('#main').textContent,/<img/);a.route('launch');assert.ok(a.d.querySelector('[data-chain="deploy-token"]'));assert.match(a.d.title,/部署工作台/)}finally{a.dom.window.close()}});
test('missing backend never falls back to browser balance for onchain claims',async()=>{const a=await setup(false);try{assert.match(a.d.querySelector('#main').textContent,/后台不可用/);assert.equal(a.d.querySelector('[data-chain="claim"]').disabled,true);assert.equal(a.d.querySelector('#main .stat-card strong').textContent,'—')}finally{a.dom.window.close()}});
