import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
const html=readFileSync('dist/index.html','utf8');
function setup(saved){
 const dom=new JSDOM(html,{url:'https://demo.test/#feed',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.scrollTo=()=>{};w.crypto.randomUUID=randomUUID;
 if(saved)w.localStorage.setItem('monperks-community-v1',saved);
 for(const name of ['config','adapters','app','community'])w.eval(readFileSync(`dist/${name}.js`,'utf8'));
 return {w,d,dom,click:selector=>{const target=d.querySelector(selector);assert.ok(target,selector);target.click()},fill:(selector,value)=>{const target=d.querySelector(selector);assert.ok(target);target.value=value;target.dispatchEvent(new w.Event('input',{bubbles:true}))},submit:selector=>d.querySelector(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),route:hash=>{w.location.hash=hash;w.dispatchEvent(new w.HashChangeEvent('hashchange'))},state:()=>JSON.parse(w.localStorage.getItem('monperks-community-v1'))};
}
function post(a,title='我的旅行省钱小技巧',body='先列好需求清单，再检查优惠适用条件，理性消费。'){
 a.click('[data-community="compose"]');a.fill('#post-title',title);a.fill('#post-body',body);a.submit('#community-compose');return a.state().posts[0];
}
test('community feed filters by brand follows, topic, search and saved discussion',()=>{const a=setup();try{
 assert.equal(a.d.querySelectorAll('#community-stream .community-post').length,5);
 a.click('[data-community="more"]');assert.equal(a.d.querySelectorAll('#community-stream .community-post').length,6);
 a.click('[data-community="tab"][data-id="following"]');assert.ok(a.d.querySelector('.empty-state'));
 a.click('[data-community="follow"][data-id="nike"]');assert.equal(a.d.querySelectorAll('#community-stream .community-post').length,1);assert.deepEqual(a.state().followed,['nike']);
 a.click('[data-community="bookmark"][data-id="seed-nike"]');a.click('[data-community="tab"][data-id="bookmarks"]');assert.equal(a.d.querySelectorAll('#community-stream .community-post').length,1);
 a.fill('#feed-search','不存在的动态');assert.equal(a.d.querySelectorAll('#community-stream .community-post').length,0);
 a.fill('#feed-search','');a.click('[data-community="tab"][data-id="for-you"]');a.click('[data-community="topic"][data-id="web3"]');assert.equal(a.d.querySelectorAll('#community-stream .community-post').length,1);assert.match(a.d.querySelector('#community-stream').textContent,/积分就上链/);
}finally{a.dom.window.close()}});
test('useful votes toggle once and never create redeemable points',()=>{const a=setup();try{
 const before=a.w.MONPERKS_APP.getState().points;
 a.click('[data-community="vote"][data-id="seed-nike"]');assert.equal(a.state().votes.length,1);assert.match(a.d.querySelector('[data-community="vote"][data-id="seed-nike"]').textContent,/25/);
 a.click('[data-community="vote"][data-id="seed-nike"]');assert.equal(a.state().votes.length,0);assert.equal(a.w.MONPERKS_APP.getState().points,before);
}finally{a.dom.window.close()}});
test('publish, edit, withdraw and restore own post, including escaped text',()=>{const a=setup();try{
 const p=post(a,'购物清单 <img src=x onerror=alert(1)>','正文 <script>alert(1)</script> 也应该作为普通文字显示。');
 assert.equal(p.mine,true);assert.equal(a.d.querySelector('#community-stream img'),null);assert.equal(a.d.querySelector('#community-stream script'),null);assert.match(a.d.querySelector('#community-stream').textContent,/<script>/);
 a.click(`[data-community="manage"][data-id="${p.id}"]`);a.click(`[data-community="edit"][data-id="${p.id}"]`);a.fill('#post-title','修改后的购物清单');a.submit('#community-compose');assert.equal(a.state().posts[0].title,'修改后的购物清单');
 a.click(`[data-community="manage"][data-id="${p.id}"]`);a.click(`[data-community="hide"][data-id="${p.id}"]`);assert.equal(a.d.querySelector(`[data-post-id="${p.id}"]`),null);
 a.route('dashboard');a.click('[data-community="recycle"]');a.click(`[data-community="restore"][data-id="${p.id}"]`);assert.equal(a.state().hidden.length,0);assert.ok(a.d.querySelector(`#main [data-post-id="${p.id}"]`));
}finally{a.dom.window.close()}});
test('invalid source URL cannot publish; comments are local, escaped and retractable',()=>{const a=setup();try{
 a.click('[data-community="compose"]');a.fill('#post-title','测试一个来源链接');a.fill('#post-body','这是一段需要校验来源链接的正常正文。');a.fill('#post-link','javascript:alert(1)');a.submit('#community-compose');assert.match(a.d.querySelector('#compose-error').textContent,/HTTPS/);assert.equal(a.state(),null);a.w.MONPERKS_APP.closeModal();
 a.click('[data-community="detail"][data-id="seed-nike"]');a.fill('#comment-text','<img src=x onerror=alert(1)> 我更看重退换条款。');a.submit('#community-comment');assert.equal(a.state().comments['seed-nike'].length,1);assert.equal(a.d.querySelector('.discussion-list img'),null);assert.match(a.d.querySelector('.discussion-list').textContent,/<img/);a.click('[data-community="remove-comment"]');assert.equal(a.state().comments['seed-nike'].length,0);assert.equal(a.w.MONPERKS_APP.getState().points,1250);
}finally{a.dom.window.close()}});
test('report hides locally and can restore, notification marks read without external messages',()=>{const a=setup();try{
 a.click('[data-community="report"][data-id="seed-nike"]');a.fill('#report-reason','misleading');a.submit('#community-report');assert.equal(a.state().reports.length,1);assert.ok(a.state().hidden.includes('seed-nike'));assert.equal(a.d.querySelector('#community-stream [data-post-id="seed-nike"]'),null);
 a.route('dashboard');a.click('[data-community="recycle"]');a.click('[data-community="restore"][data-id="seed-nike"]');a.w.MONPERKS_APP.closeModal();
 a.route('brands');a.click('[data-community="follow"][data-id="nike"]');a.click('[data-community="notifications"]');assert.match(a.d.querySelector('#modal-content').textContent,/关注成功/);a.click('[data-community="read-all"]');assert.ok(a.state().notifications.every(n=>n.read));
}finally{a.dom.window.close()}});
test('profile and posts survive reload; reset core demo also clears community demo',()=>{const a=setup();let saved;try{
 a.route('settings');a.fill('#profile-name','新的探索者');a.fill('#profile-bio','寻找更好的小日常。');a.submit('#community-profile');a.route('feed');post(a);saved=a.w.localStorage.getItem('monperks-community-v1');
}finally{a.dom.window.close()}
 const b=setup(saved);try{assert.equal(b.state().name,'新的探索者');assert.equal(b.state().posts.length,1);assert.match(b.d.querySelector('#community-stream').textContent,/新的探索者/);b.route('wallet');b.click('[data-action="reset"]');b.click('[data-action="reset-confirm"]');assert.equal(b.state().posts.length,0);assert.equal(b.state().followed.length,0);assert.equal(b.state().name,'好发现探索者');assert.equal(b.w.MONPERKS_APP.getState().points,1250)}finally{b.dom.window.close()}
});
