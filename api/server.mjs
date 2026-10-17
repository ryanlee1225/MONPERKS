import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createLedger, verifyWebhook, InputError } from './ledger.mjs';

const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
const origin=process.env.APP_ORIGIN||`http://localhost:${port}`;
const sessionKey=process.env.SESSION_SECRET||randomBytes(32).toString('hex');
const ledger=createLedger(process.env.DATABASE_PATH||fileURLToPath(new URL('./monperks.sqlite',import.meta.url)));
const sign=id=>createHmac('sha256',sessionKey).update(id).digest('hex');
function session(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mp_session='))?.slice(11);if(!token)return null;const [id,sig]=token.split('.');const expected=sign(id||'');if(!/^[a-f0-9]{64}$/.test(sig||'')||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;return ledger.hasUser(id)?id:null}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)throw new InputError('Request too large',413)}return raw}
function parseJSON(raw){try{return JSON.parse(raw)}catch{throw new InputError('Invalid JSON')}}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value))}
const rates=new Map();
function limit(key){const now=Date.now();let r=rates.get(key);if(!r||r.until<now){r={count:0,until:now+60000};rates.set(key,r)}if(++r.count>100)throw new InputError('Too many requests',429);if(rates.size>10000){for(const [k,v]of rates)if(v.until<now)rates.delete(k)}}
function authorized(secret,header){if(!secret||typeof header!=='string')return false;const a=Buffer.from(secret),b=Buffer.from(header.replace(/^Bearer /,''));return a.length===b.length&&timingSafeEqual(a,b)}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
export const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,origin);
  if(u.pathname.startsWith('/api/')){
   limit(req.socket.remoteAddress);
   const mutation=req.method!=='GET';
   const hook=u.pathname.startsWith('/api/partner/');
   if(mutation&&!hook&&u.pathname!=='/api/admin/coupons'&&req.headers.origin!==origin)throw new InputError('Origin not allowed',403);
   if(mutation&&!(req.headers['content-type']||'').startsWith('application/json'))throw new InputError('application/json required',415);
   if(req.method==='GET'&&u.pathname==='/api/status')return json(res,200,{mode:'demo',livePayouts:false,adProviders:{google:'not_configured',meta:'not_configured',tiktok:'not_configured'},chainId:10143});
   if(req.method==='GET'&&u.pathname==='/api/coupons')return json(res,200,{offers:ledger.coupons(),source:'authorized-imports',demoCatalogIsBrowserLocal:true});
   if(req.method==='POST'&&u.pathname==='/api/demo/session'){let id=session(req);if(!id)id=ledger.createUser();return json(res,200,{accountId:id,balance:ledger.balance(id),mode:'demo'}, {'Set-Cookie':`mp_session=${id}.${sign(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin.startsWith('https:')?'; Secure':''}`})}
   if(u.pathname.startsWith('/api/demo/')){const id=session(req);if(!id)throw new InputError('Create a demo session first',401);if(req.method==='GET'&&u.pathname==='/api/demo/account')return json(res,200,{balance:ledger.balance(id),ledger:ledger.history(id),mode:'demo'});if(req.method==='POST'&&u.pathname==='/api/demo/checkin')return json(res,200,ledger.checkin(id));if(req.method==='POST'&&u.pathname==='/api/demo/redeem'){const b=parseJSON(await body(req));return json(res,200,ledger.redeem(id,b.points,b.address,req.headers['idempotency-key']))}}
   if(req.method==='POST'&&u.pathname==='/api/partner/events'){const raw=await body(req);if(!verifyWebhook(raw,req.headers['x-event-timestamp'],req.headers['x-event-signature'],process.env.PARTNER_WEBHOOK_SECRET))throw new InputError('Webhook signature invalid or expired',401);return json(res,202,ledger.recordPartnerEvent(req.headers['x-partner-provider'],parseJSON(raw)))}
   if(req.method==='POST'&&u.pathname==='/api/admin/coupons'){if(!authorized(process.env.ADMIN_API_TOKEN,req.headers.authorization))throw new InputError('Admin token required',401);return json(res,200,ledger.importCoupons(parseJSON(await body(req)).offers))}
   if(u.pathname==='/api/redeem')return json(res,503,{error:'Live settlement is not enabled. Wallet authentication, verified merchant reconciliation, funded token pool and deployed contracts are required.',code:'LIVE_DISABLED'});
   return json(res,404,{error:'Unknown API route'});
  }
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
  let rel;try{rel=decodeURIComponent(u.pathname)}catch{throw new InputError('Invalid path')}
  const target=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));
  if(!target.startsWith(root+path.sep)&&target!==path.join(root,'index.html'))return json(res,403,{error:'Forbidden'});
  let file;try{file=await readFile(target)}catch{return json(res,404,{error:'Not found'})}
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://testnet-rpc.monad.xyz; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'});res.end(req.method==='HEAD'?undefined:file);
 }catch(e){json(res,e instanceof InputError?e.status:500,{error:e instanceof InputError?e.message:'Internal server error'})}
});
server.listen(port,host,()=>console.log(`MONPERKS demo ready at http://localhost:${port}`));
process.on('SIGINT',()=>server.close(()=>{ledger.close();process.exit(0)}));
process.on('SIGTERM',()=>server.close(()=>{ledger.close();process.exit(0)}));
