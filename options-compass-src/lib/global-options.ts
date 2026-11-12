import { unzipSync, strFromU8 } from 'fflate';
export type GlobalContract={code:string;side:'CALL'|'PUT';expiry:string;strike:number;volume:number|null;oi:number|null;oiChange:number|null;price:number|null;iv:number|null};
export type GlobalMarket={symbol:string;name:string;region:'미국'|'일본'|'홍콩';kind:'지수'|'ETF'|'주식';currency:string;source:string;sourceUrl:string;date:string;fetchedAt:string;delay:string;scope:string;spot:number|null;changePct:number|null;contracts:GlobalContract[];history:{date:string;close:number}[];oiDate:string|null;status:'ready'|'waiting'|'stale';refreshDate?:string;message?:string};
export const US_MARKETS=[['SPX','S&P 500','지수'],['NDX','나스닥 100','지수'],['RUT','러셀 2000','지수'],['SPY','S&P 500 ETF','ETF'],['QQQ','나스닥 100 ETF','ETF'],['IWM','러셀 2000 ETF','ETF'],['DIA','다우존스 ETF','ETF'],['NVDA','엔비디아','주식'],['TSLA','테슬라','주식'],['AMD','AMD','주식'],['AAPL','애플','주식'],['MSFT','마이크로소프트','주식'],['META','메타','주식'],['AMZN','아마존','주식'],['GOOGL','알파벳','주식']] as const;
export function num(v:unknown):number|null{if(v===null||v===undefined||String(v).trim()===''||String(v).trim()==='-')return null;const n=Number(String(v).replaceAll(',',''));return Number.isFinite(n)?n:null;}
const nonnegative=(v:unknown)=>{const n=num(v);return n!==null&&n>=0?n:null;};
const positive=(v:unknown)=>{const n=num(v);return n!==null&&n>0?n:null;};
export function csvRows(text:string){return text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(line=>{const values:string[]=[];let field='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){values.push(field.trim());field='';}else field+=c;}values.push(field.trim());return values;});}
const unescapeXml=(s:string)=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x]!));
function xmlText(s:string){return unescapeXml([...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join(''));}
export function parseJpxOi(bytes:Uint8Array,date?:string){
 const zip=unzipSync(bytes),shared=strFromU8(zip['xl/sharedStrings.xml']),sheet=strFromU8(zip['xl/worksheets/sheet2.xml']);
 if(date){const serial=sheet.match(/<c\b[^>]*r="A2"[^>]*>[\s\S]*?<v>(\d+)<\/v>/)?.[1];if(!serial||new Date(Date.UTC(1899,11,30)+Number(serial)*86400000).toISOString().slice(0,10).replaceAll('-','')!==date)throw new Error('jpx_oi_date_mismatch');}
 const strings=[...shared.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(x=>xmlText(x[1]));
 const result=new Map<string,Pick<GlobalContract,'volume'|'oi'|'oiChange'>>();
 for(const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
  const cells:Record<string,string>={};
  for(const c of r[1].matchAll(/<c\b([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g)){
   const col=c[1].match(/\br="([A-Z]+)\d+"/)?.[1],v=c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];if(!col)continue;
   cells[col]=/\bt="s"/.test(c[1])?strings[Number(v)]:/\bt="inlineStr"/.test(c[1])?xmlText(c[2]):v??'';
  }
  for(const [name,vol,oi,delta] of [['A','B','C','D'],['G','H','I','J']]){
   const m=cells[name]?.match(/^NIKKEI 225 ([PC])(\d{4})-(\d+(?:\.\d+)?)$/);if(!m)continue;
   result.set(`20${m[2]}:${m[1]}:${Number(m[3])}`,{volume:nonnegative(cells[vol]),oi:nonnegative(cells[oi]),oiChange:num(cells[delta])});
  }
 }
 if(!result.size)throw new Error('jpx_oi_empty');return result;
}
export function parseJpx(csv:string,bytes:Uint8Array,date:string):GlobalMarket{
 const oi=parseJpxOi(bytes,date),contracts:GlobalContract[]=[];let spot:number|null=null;
 const prices=csv.split(/\r?\n/).filter(line=>/^"?NK225E\s*"?\s*,/.test(line)).join('\n');
 for(const r of csvRows(prices)){
  if(r[0]!=='NK225E'||!/^\d{6}$/.test(r[2]))continue;
  const strike=positive(r[3]);if(!strike)continue;const underlying=positive(r[15]);if(underlying)spot=underlying;
  for(const [side,key,priceIndex,ivIndex,codeIndex] of [['PUT','P',6,9,5],['CALL','C',11,14,10]] as const){
   const daily=oi.get(`${r[2]}:${key}:${strike}`);if(!daily)continue;
   contracts.push({code:r[codeIndex],side,expiry:r[2],strike,...daily,price:positive(r[priceIndex]),iv:positive(r[ivIndex])});
  }
 }
 if(!spot||!contracts.some(c=>c.side==='CALL')||!contracts.some(c=>c.side==='PUT'))throw new Error('jpx_chain_invalid');
 return {symbol:'N225',name:'닛케이 225',region:'일본',kind:'지수',currency:'JPY',source:'JPX',sourceUrl:'https://www.jpx.co.jp/english/markets/derivatives/trading-volume/index.html',date,fetchedAt:new Date().toISOString(),delay:'일별 확정',scope:'표준 월간 옵션 · 야간 포함 일별 자료 · 미니 제외',spot,changePct:null,contracts,history:[],oiDate:date,status:'ready'};
}
const months:Record<string,string>={JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
export function parseHkex(bytes:Uint8Array,date:string):GlobalMarket{
 const zip=unzipSync(bytes);const file=Object.entries(zip).find(([name])=>/\.csv$/i.test(name));if(!file)throw new Error('hkex_zip_invalid');
 const text=strFromU8(file[1]);if(!/HANG SENG INDEX OPTIONS DAILY MARKET REPORT/i.test(text))throw new Error('hkex_product_invalid');
 // The top-10 summary and subtotal rows are deliberately excluded; only 20-column contract rows are parsed.
 const reportDate=Number(date.slice(6))+' '+Object.keys(months).find(k=>months[k]===date.slice(4,6))+' '+date.slice(0,4);if(!text.includes(reportDate))throw new Error('hkex_date_mismatch');
 const contracts:GlobalContract[]=[];
 for(const r of csvRows(text)){
  const m=r[0].match(/^([A-Z]{3})-(\d{2})$/);if(!m||!months[m[1]]||r.length!==20||!['C','P'].includes(r[2]))continue;
  const strike=positive(r[1]);if(!strike)continue;const expiry=`20${m[2]}${months[m[1]]}`;
  contracts.push({code:`HSI:${expiry}:${r[2]}:${strike}`,side:r[2]==='C'?'CALL':'PUT',expiry,strike,volume:nonnegative(r[17]),oi:nonnegative(r[18]),oiChange:num(r[19]),price:positive(r[11]),iv:positive(r[13])!==null?Number(r[13])/100:null});
 }
 if(!contracts.length)throw new Error('hkex_chain_empty');
 return {symbol:'HSI',name:'항셍',region:'홍콩',kind:'지수',currency:'HKD',source:'HKEX',sourceUrl:'https://www.hkex.com.hk/Market-Data/Statistics/Derivatives-Market/Daily-Market-Report?sc_lang=en',date,fetchedAt:new Date().toISOString(),delay:'일별 확정',scope:'표준 월간 옵션 · 야간+주간 합계 · 미니 제외',spot:null,changePct:null,contracts,history:[],oiDate:date,status:'ready'};
}
export function parseMarketData(raw:any,symbol:string):GlobalMarket{
 const meta=US_MARKETS.find(r=>r[0]===symbol);if(!meta||raw.s!=='ok'||!Array.isArray(raw.optionSymbol))throw new Error('us_chain_invalid');
 const seen=new Set<string>(),contracts:GlobalContract[]=[];let spot:number|null=null;const dates:string[]=[];
 for(let i=0;i<raw.optionSymbol.length;i++){
  const code=String(raw.optionSymbol[i]),side=String(raw.side?.[i]).toLowerCase(),strike=positive(raw.strike?.[i]);
  if(seen.has(code)||!['call','put'].includes(side)||!strike)continue;
  const expiry=code.match(/(\d{6})[CP]\d{8}$/)?.[1];if(!expiry)continue;
  const expiration=`20${expiry.slice(0,2)}-${expiry.slice(2,4)}-${expiry.slice(4,6)}`;
  const updated=positive(raw.updated?.[i]);if(updated)dates.push(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(updated*1000)).replaceAll('-',''));
  const sp=positive(raw.underlyingPrice?.[i]);if(sp)spot=sp;
  contracts.push({code,side:side==='call'?'CALL':'PUT',expiry:expiration,strike,volume:nonnegative(raw.volume?.[i]),oi:nonnegative(raw.openInterest?.[i]),oiChange:null,price:positive(raw.last?.[i]),iv:positive(raw.iv?.[i])});seen.add(code);
 }
 const date=dates.sort().at(-1);if(!date||!spot||!contracts.length)throw new Error('us_quote_date_missing');
 return {symbol,name:meta[1],kind:meta[2],region:'미국',currency:'USD',source:'MarketData',sourceUrl:'https://www.marketdata.app/docs/api/options/chain/',date,fetchedAt:new Date().toISOString(),delay:'무료 · 24시간 이상 지연',scope:'최근 만기+다음 월간 만기 · 만기별 최대 150개 행사가',spot,changePct:null,contracts,history:[],oiDate:null,status:'ready'};
}
export function filteredContracts(market:GlobalMarket,expiry='all'){return market.contracts.filter(c=>expiry==='all'||c.expiry===expiry);}
export function summarize(market:GlobalMarket,expiry='all',metric:'volume'|'oi'='volume'){
 const rows=filteredContracts(market,expiry);const sum=(side:'CALL'|'PUT',field:'volume'|'oi')=>{const a=rows.filter(c=>c.side===side&&c[field]!==null);return a.length?a.reduce((n,c)=>n+c[field]!,0):null;};
 const calls=sum('CALL',metric),puts=sum('PUT',metric),total=calls!==null&&puts!==null?calls+puts:null;
 const ivExpiry=[...new Set(rows.map(c=>c.expiry))].sort()[0];
 const near=rows.filter(c=>c.expiry===ivExpiry&&market.spot&&Math.abs(c.strike/market.spot-1)<=.015&&c.iv!==null&&(c.volume??0)>0).map(c=>c.iv!).sort((a,b)=>a-b);
 const iv=near.length?near[Math.floor(near.length/2)]:null;
 const zones=new Map<number,{strike:number;call:number;put:number;oiChange:number|null}>();
 for(const c of rows){const r=zones.get(c.strike)??{strike:c.strike,call:0,put:0,oiChange:null};r[c.side==='CALL'?'call':'put']+=c[metric]??0;if(c.oiChange!==null)r.oiChange=(r.oiChange??0)+c.oiChange;zones.set(c.strike,r);}
 return {calls,puts,total,ratio:calls!==null&&calls>0&&puts!==null?puts/calls:null,callShare:total!==null&&total>0&&calls!==null?calls/total:null,iv,expectedDailyPct:iv!==null?iv/Math.sqrt(252)*100:null,zones:[...zones.values()].sort((a,b)=>a.strike-b.strike),contracts:rows.length};
}
export function freeUsDate(now=new Date()){
 // Options EOD becomes historical at 09:30:01 ET on the next trading session.
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const get=(k:string)=>Number(parts.find(p=>p.type===k)!.value);const d=new Date(Date.UTC(get('year'),get('month')-1,get('day')));
 const sessionOpen=![0,6].includes(d.getUTCDay())&&get('hour')*3600+get('minute')*60+get('second')>=9*3600+30*60+1;
 const previous=()=>{do{d.setUTCDate(d.getUTCDate()-1);}while([0,6].includes(d.getUTCDay()));};previous();if(!sessionOpen)previous();return d.toISOString().slice(0,10);
}
