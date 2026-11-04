(async function(){
'use strict';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
let holidays=new Set();
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error(r.status);return await r.json();}finally{clearTimeout(t);}}
try{const h=await get('https://minguisstockgoat.github.io/passive-etf-dashboard/data/holidays.json');holidays=new Set(h.dates||[]);}catch(e){}
function date(s){s=String(s||'');return /^\d{8}/.test(s)?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8):s.slice(0,10);}
function lag(s){const iso=date(s);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return Infinity;let d=new Date(iso+'T00:00:00Z'),end=new Date(today+'T00:00:00Z'),n=0;while(d<end){d.setUTCDate(d.getUTCDate()+1);if(d.getUTCDay()%6!==0&&!holidays.has(d.toISOString().slice(0,10)))n++;}return n;}
function base(s,label){const n=lag(s);return {text:label+' '+date(s)+(n>2?' · '+n+'거래일 경과':''),level:n>2?'bad':''};}
const rules={
'overnight-terminal':async u=>{const d=await get(u+'data/finra_credit.json');return base(d.latestDate,'일별 지표');},
'overnight-us-brief':async u=>{const d=await get(u+'data.json');const v=base(d.generatedAt,'브리핑');if(d.status!=='ok')v.level='warn';return v;},
'pattern-screener':async u=>base((await get(u+'data/summary.json')).base_date,'종가 기준'),
'short-interest-dashboard':async u=>{const d=(await get(u+'dashboard_data.json')).meta;const v=base(d.asof,'기준');v.text+=' · 잔고 확정 '+date(d.knownDate);return v;},
'passive-etf-dashboard':async u=>{const d=await get(u+'data/changes.json');const missing=d.etfs.filter(e=>lag(e.latest_date)>2).length;const delayed=d.etfs.filter(e=>lag(e.latest_date)>1).length;return {text:d.etfs.length+'종 · '+(missing?'3거래일 이상 지연 '+missing+'종':delayed?'공시 2거래일 지연 '+delayed+'종':'원천 날짜 확인됨'),level:missing?'bad':delayed?'warn':''};},
'hynix-ADR-etc':async u=>base((await get(u+'data.json')).updated,'저장 시세'),
'event-calendar':async u=>base((await get(u+'calendar_data.json')).meta.generated_at,'공시 캘린더'),
'market-alert-dashboard':async u=>base((await get(u+'data.json')).as_of,'시장경보 기준'),
'earnings-week':async u=>{const d=await get(u+'health.json');return {text:'미국 '+date(d.usUpdatedAt)+(d.japanRangeEnd<today?' · 일본 자료 만료':''),level:d.usRangeEnd<today?'bad':d.japanRangeEnd<today?'warn':''};},
'fwd-per-band':async u=>base((await get(u+'data/index.json')).meta.updated,'기준'),
'consumer-trend-screener':async u=>{const d=await get(u+'data/trends.json');const values=Object.values(d.items||{});const dated=values.filter(e=>e.updated_at);const old=dated.filter(e=>Date.now()-Date.parse(e.updated_at)>7*86400000).length;return {text:'단기 '+dated.length+'/'+values.length+'개 · 7일 초과 '+old+'개',level:old||dated.length<values.length?'warn':''};}
};
await Promise.all([...document.querySelectorAll('a.card')].map(async card=>{const span=document.createElement('span');span.className='ops-status';span.textContent='기준일 확인 중…';card.append(span);try{const key=Object.keys(rules).find(k=>card.href.includes('/'+k+'/'));if(!key){span.textContent='실시간 화면에서 시세 시각 확인';return;}const r=await rules[key](card.href);span.textContent=r.text;span.className='ops-status '+r.level;}catch(e){span.textContent='상태 조회 실패 · 원문에서 확인';span.classList.add('warn');}}));
})();
