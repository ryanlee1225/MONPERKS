import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

export class InputError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validateAddress(address){return typeof address==='string'&&/^0x[a-fA-F0-9]{40}$/.test(address)&&!/^0x0{40}$/i.test(address);}
export function verifyWebhook(raw, timestamp, signature, secret, now=Date.now()){
  if(!secret||typeof timestamp!=='string'||!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300000||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const expected=createHmac('sha256',secret).update(timestamp+'.'+raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
export function createLedger(filename=':memory:'){
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), source TEXT NOT NULL, source_id TEXT NOT NULL, delta INTEGER NOT NULL CHECK(delta!=0), created_at TEXT NOT NULL, UNIQUE(user_id,source,source_id));
    CREATE TABLE IF NOT EXISTS redemptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, points INTEGER NOT NULL, address TEXT NOT NULL,status TEXT NOT NULL CHECK(status='demo_completed'),created_at TEXT NOT NULL, UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS partner_events(provider TEXT NOT NULL,event_id TEXT NOT NULL,account_ref TEXT NOT NULL,offer_id TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(provider,event_id));
    CREATE TABLE IF NOT EXISTS coupons(id TEXT PRIMARY KEY,brand TEXT NOT NULL,title TEXT NOT NULL,url TEXT NOT NULL,code TEXT NOT NULL,expires_at TEXT NOT NULL,source TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
  const balance=id=>Number(db.prepare('SELECT COALESCE(SUM(delta),0) AS balance FROM ledger WHERE user_id=?').get(id).balance);
  const ensureUser=id=>{if(!db.prepare('SELECT id FROM users WHERE id=?').get(id))throw new InputError('Unknown demo account',401)};
  const createUser=()=>tx(()=>{const id=randomUUID(),at=new Date().toISOString();db.prepare('INSERT INTO users VALUES(?,?)').run(id,at);db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?)').run(randomUUID(),id,'welcome','v1',1250,at);return id});
  function checkin(id){return tx(()=>{ensureUser(id);const result=db.prepare('INSERT OR IGNORE INTO ledger VALUES(?,?,?,?,?,?)').run(randomUUID(),id,'checkin',day(),20,new Date().toISOString());return {awarded:!!result.changes,balance:balance(id)}})}
  function redeem(id,points,address,key){
    if(!Number.isSafeInteger(points)||points<1000||points>100000000)throw new InputError('Minimum 1000 integer points');
    if(!validateAddress(address))throw new InputError('Invalid EVM address');
    if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw new InputError('An idempotency key of 16-100 characters is required');
    return tx(()=>{ensureUser(id);const prior=db.prepare('SELECT * FROM redemptions WHERE user_id=? AND request_key=?').get(id,key);if(prior){if(prior.points!==points||prior.address.toLowerCase()!==address.toLowerCase())throw new InputError('Idempotency key already used for a different request',409);return {...prior,replayed:true}}
      if(balance(id)<points)throw new InputError('Insufficient points',409);
      const r={id:randomUUID(),user_id:id,request_key:key,points,address,status:'demo_completed',created_at:new Date().toISOString()};
      db.prepare('INSERT INTO redemptions VALUES(?,?,?,?,?,?,?)').run(r.id,id,key,points,address,r.status,r.created_at);
      db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?)').run(randomUUID(),id,'redeem',r.id,-points,r.created_at);
      return {...r,replayed:false};
    });
  }
  function recordPartnerEvent(provider,payload){
    if(!['affiliate','direct-sponsor'].includes(provider))throw new InputError('Provider is not enabled for redeemable rewards',403);
    if(!payload||!['eventId','accountRef','offerId'].every(k=>typeof payload[k]==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(payload[k])))throw new InputError('Invalid event fields');
    // Intake only: signatures prove transport integrity, not business eligibility.
    // Reconciliation, attribution, refund windows and authorization must precede credit.
    const result=db.prepare('INSERT OR IGNORE INTO partner_events VALUES(?,?,?,?,?,?,?)').run(provider,payload.eventId,payload.accountRef,payload.offerId,'pending_review',JSON.stringify(payload),new Date().toISOString());
    return {accepted:!!result.changes,status:'pending_review',credited:false};
  }
  function importCoupons(items){
    if(!Array.isArray(items)||!items.length||items.length>100)throw new InputError('Import 1-100 authorized offers at a time');
    const clean=items.map(o=>{if(!o||!['id','brand','title','url','code','expiresAt','source'].every(k=>typeof o[k]==='string'&&o[k].length<=1000))throw new InputError('Missing offer field');let url;try{url=new URL(o.url)}catch{throw new InputError('Invalid offer URL')}if(url.protocol!=='https:'||url.username||url.password)throw new InputError('Offer URL must use HTTPS without credentials');if(!/^[a-z0-9_-]{1,80}$/.test(o.id)||!o.brand.trim()||!o.title.trim()||!o.source.trim()||!Number.isFinite(Date.parse(o.expiresAt))||Date.parse(o.expiresAt)<=Date.now())throw new InputError('Invalid offer identity, source or expiry');return o});
    return tx(()=>{const q=db.prepare('INSERT INTO coupons VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET brand=excluded.brand,title=excluded.title,url=excluded.url,code=excluded.code,expires_at=excluded.expires_at,source=excluded.source,updated_at=excluded.updated_at');for(const o of clean)q.run(o.id,o.brand,o.title,o.url,o.code,o.expiresAt,o.source,new Date().toISOString());return {imported:clean.length}});
  }
  return {db,createUser,balance,checkin,redeem,recordPartnerEvent,importCoupons,hasUser:id=>!!db.prepare('SELECT id FROM users WHERE id=?').get(id),history:id=>db.prepare('SELECT source,delta,created_at FROM ledger WHERE user_id=? ORDER BY rowid DESC LIMIT 100').all(id),coupons:()=>db.prepare('SELECT * FROM coupons WHERE expires_at>? ORDER BY updated_at DESC').all(new Date().toISOString()),close:()=>db.close()};
}
