import {webcrypto,randomBytes,pbkdf2Sync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://options-compass-kr-1105.snu-chatgpt-5678.chatgpt.site';
const OUTPUT = path.join(ROOT, 'options-compass/data');
const config = JSON.parse(await readFile(path.join(ROOT,'scripts/options-config.json'),'utf8'));
const secret = process.env.OPTIONS_SITE_SERVICE_TOKEN, password = process.env.OPTIONS_VIEW_PASSWORD;
let priorEnvelope = null, priorData = null;
if (!secret || !password || password.length < 16) throw new Error('Private configuration is missing.');
async function api(route, body) {
 const r = await fetch(SITE + route, {method:body===undefined?'GET':'POST', headers:{'OAI-Sites-Authorization':'Bearer '+secret,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000),redirect:'error'});
 if (!r.ok) throw new Error('source_http_'+r.status);
 return r.json();
}
function validDashboard(d) { return /^\d{8}$/.test(d?.data?.krxDate)&&d.data.spot>0&&d.data.contracts?.length>0; }
async function collect() {
 // Read-only market refresh. Telegram/report endpoints are never called.
 let dashboard;
 try { for (let i=0;i<26;i++) { dashboard = await api('/api/refresh',{}); if(!dashboard.pending)break; } }
 catch { dashboard = await api('/api/dashboard'); }
 if (dashboard?.pending) dashboard = await api('/api/dashboard');
 if (!validDashboard(dashboard)) throw new Error('invalid_korea_snapshot');
 const global = await api('/api/global-options');
 if (!Array.isArray(global.markets)||global.markets.length!==17) throw new Error('invalid_global_snapshot');
 // Existing server-side date caches and 80-credit free budget remain authoritative.
 for (let i=0;i<global.markets.length;i++) {
  try { const fresh=await api('/api/global-options',{symbol:global.markets[i].symbol}); if(fresh.market?.symbol===global.markets[i].symbol)global.markets[i]=fresh.market; }
  catch { /* Preserve the source's last valid value and original market date. */ }
 }
 const history = await api('/api/history');
 if(!Array.isArray(history.observations)) throw new Error('invalid_history');
 const orderFlow = await api('/api/order-flow?date='+dashboard.data.krxDate);
 const old = await previous();
 if (old?.dashboard?.data?.krxDate > dashboard.data.krxDate) throw new Error('korea_date_rollback');
 if (old) for (let i=0;i<global.markets.length;i++) {
  const prior=old.global.markets.find(m=>m.symbol===global.markets[i].symbol);
  if (prior?.date>global.markets[i].date) global.markets[i]=prior;
 }
 return {version:1,publishedAt:new Date().toISOString(),dashboard:{data:dashboard.data,updatedAt:dashboard.updatedAt??Date.now(),refreshConfigured:false},history,global:{markets:global.markets,freeOnly:true,usConfigured:false},orderFlow};
}
async function previous() {
 try {
  const r=await fetch('https://minguisstockgoat.github.io/options-compass/data/snapshot.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!r.ok)return null;const e=await r.json();
  const derived=pbkdf2Sync(password,Buffer.from(e.salt,'base64'),e.iterations,32,'sha256');
  const key=await webcrypto.subtle.importKey('raw',derived,'AES-GCM',false,['decrypt']);
  const raw=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(e.iv,'base64'),additionalData:Buffer.from('options-compass-pages:v1')},key,Buffer.from(e.ciphertext,'base64'));
  const {gunzipSync}=await import('node:zlib');const data=JSON.parse(gunzipSync(Buffer.from(raw)).toString());priorEnvelope=e;priorData=data;return data;
 } catch { return null; }
}
function meaningful(value) {
 if(Array.isArray(value))return value.map(meaningful);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['publishedAt','updatedAt','queriedAt','flowAt','capturedAt','fetchedAt','generatedAt'].includes(k)).map(([k,v])=>[k,meaningful(v)]));
 return value;
}
let snapshot=await collect();
let envelope;
if(priorData&&JSON.stringify(meaningful(snapshot))===JSON.stringify(meaningful(priorData))){snapshot=priorData;envelope=priorEnvelope;}
else {
const salt=Buffer.from(config.salt,'base64'), iv=randomBytes(12), iterations=310000;
const derived=pbkdf2Sync(password,salt,iterations,32,'sha256');
const key=await webcrypto.subtle.importKey('raw',derived,'AES-GCM',false,['encrypt']);
const ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:Buffer.from('options-compass-pages:v1')},key,gzipSync(Buffer.from(JSON.stringify(snapshot))));
envelope={version:1,cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations,salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:Buffer.from(ciphertext).toString('base64')};
}
await mkdir(OUTPUT,{recursive:true});
await writeFile(path.join(OUTPUT,'snapshot.json'),JSON.stringify(envelope));
await writeFile(path.join(OUTPUT,'status.json'),JSON.stringify({version:1,publishedAt:snapshot.publishedAt,koreaDate:snapshot.dashboard.data.krxDate,marketCount:snapshot.global.markets.length}));
console.log(JSON.stringify({status:'encrypted',koreaDate:snapshot.dashboard.data.krxDate,markets:snapshot.global.markets.length,publishedAt:snapshot.publishedAt}));
