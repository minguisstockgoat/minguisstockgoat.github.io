type Snapshot = { version: 1; publishedAt: string; dashboard: any; history: any; global: any; orderFlow: any };
type Envelope = { version: number; cipher: string; kdf: string; iterations: number; salt: string; iv: string; ciphertext: string };
const aad = new TextEncoder().encode('options-compass-pages:v1');
let current: Snapshot | null = null;
let key: CryptoKey | null = null;
let salt = '';
let loadedAt = 0;
let pending: Promise<Snapshot> | null = null;
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export async function fetchEnvelope(): Promise<Envelope> {
 const r = await window.fetch(new URL('data/snapshot.json', location.href), {cache: 'no-store'});
 if (!r.ok) throw new Error('배포 자료를 받지 못했습니다. 잠시 후 다시 시도하세요.');
 const e = await r.json();
 if (e.version !== 1 || e.cipher !== 'AES-256-GCM' || e.kdf !== 'PBKDF2-SHA256' || e.iterations !== 310000 || bytes(e.salt).length !== 32 || bytes(e.iv).length !== 12) throw new Error('자료 형식을 확인하지 못했습니다.');
 return e;
}
async function decrypt(e: Envelope): Promise<Snapshot> {
 if (!key || e.salt !== salt) throw new Error('비밀번호로 다시 열어 주세요.');
 const raw = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes(e.iv), additionalData: aad}, key, bytes(e.ciphertext));
 const text = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
 const data = JSON.parse(text) as Snapshot;
 if (data.version !== 1 || !data.dashboard?.data?.contracts?.length || !Array.isArray(data.global?.markets)) throw new Error('자료를 확인하지 못했습니다.');
 current = data; loadedAt = Date.now();
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('options-pages-updated',{detail:data.publishedAt}));
 return data;
}
export async function unlock(password: string, e: Envelope) {
 const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
 key = await crypto.subtle.deriveKey({name: 'PBKDF2', salt: bytes(e.salt), iterations: e.iterations, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
 salt = e.salt;
 try { return await decrypt(e); } catch { key = null; throw new Error('비밀번호가 맞지 않거나 자료를 열 수 없습니다.'); }
}
export function lock() { current = null; key = null; salt = ''; loadedAt = 0; }
async function snapshot(refresh = false): Promise<Snapshot> {
 if (!current) throw new Error('비밀번호로 먼저 열어 주세요.');
 if (!refresh || Date.now() - loadedAt < 15000) return current;
 if (!pending) pending = fetchEnvelope().then(decrypt).finally(() => { pending = null; });
 return pending;
}
export async function snapshotFetch(input: string, init?: RequestInit): Promise<Response> {
 if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
 const url = new URL(input, location.origin);
 const d = await snapshot(init?.method === 'POST');
 let result: any;
 switch (url.pathname) {
  case '/api/dashboard': result = {...d.dashboard, refreshConfigured: false}; break;
  case '/api/refresh': result = {...d.dashboard, refreshConfigured: false, cached: true}; break;
  case '/api/history': result = d.history; break;
  case '/api/global-options': {
   if (init?.method === 'POST') { const request = JSON.parse(String(init.body ?? '{}')); result = {market: d.global.markets.find((m: any) => m.symbol === request.symbol)}; }
   else result = {...d.global, usConfigured: false};
   break;
  }
  case '/api/order-flow': result = {data: d.orderFlow?.data?.date === url.searchParams.get('date') ? d.orderFlow.data : null}; break;
  default: return Response.json({error: 'unknown_data'}, {status: 404});
 }
 return Response.json(result);
}
