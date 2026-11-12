export type Raw = Record<string, string>;
export type Product = "monthly" | "monday" | "thursday";
export type Contract = { code: string; name: string; product: Product; expiry: string; strike: number; side: "CALL" | "PUT"; price: number | null; iv: number | null; volume: number; oi: number; oiChange?: number | null };
export type HistoryPoint = { date: string; close: number; changePct: number; options: Raw[]; low?: number | null; high?: number | null; kospiLow?: number | null; kospiHigh?: number | null; kospiClose?: number | null; kospiChangePct?: number | null; metrics?: ReturnType<typeof volatility>; expiry?: string };
export type RawBundle = { generatedAt: string; marketSource?: 'KRX'|'KIS'; marketCapturedAt?: string; marketSession?: 'intraday'|'after_close'; optionRangePct?: number; krxDate: string; index: Raw; kospi?: Raw; kospiDate?: string; options: Raw[]; history: HistoryPoint[]; flow: { queriedAt: string; data: Record<string, Raw> }; us: any };
export const PRODUCT_LABELS = { monthly: "월간 옵션", monday: "월요일 주간물", thursday: "목요일 주간물" };
export const number = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(String(v).replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
};
export function normalize(rows: Raw[]): Contract[] {
  const map = new Map<string, Contract>();
  for (const r of rows) {
    if (!r.ISU_NM?.includes("(정규)")) continue;
    const product: Product | undefined = r.PROD_NM === "코스피200 옵션" ? "monthly" : r.PROD_NM === "코스피200 위클리(월) 옵션" ? "monday" : r.PROD_NM === "코스피200 위클리(목) 옵션" ? "thursday" : undefined;
    const m = r.ISU_NM.match(/\s[CP]\s+(\d{6}|\d{4}W\d+)\s+([\d,.]+)/);
    if (!product || !m || !["CALL", "PUT"].includes(r.RGHT_TP_NM)) continue;
    const strike = number(m[2]); if (!strike || strike <= 0) continue;
    const iv = number(r.IMP_VOLT);
    const row: Contract = { code: r.ISU_CD, name: r.ISU_NM, product, expiry: m[1], strike, side: r.RGHT_TP_NM as "CALL" | "PUT", price: number(r.TDD_CLSPRC), iv: iv !== null && iv > 0 && iv < 200 ? iv : null, volume: number(r.ACC_TRDVOL) ?? 0, oi: number(r.ACC_OPNINT_QTY) ?? 0, oiChange:number(r.OPNINT_CHANGE) };
    map.set(`${row.product}-${row.expiry}-${row.side}-${row.strike}`, row);
  }
  return [...map.values()];
}
const median = (ns: number[]) => { const a = [...ns].sort((a,b)=>a-b); return a.length ? a.length % 2 ? a[Math.floor(a.length/2)] : (a[a.length/2-1]+a[a.length/2])/2 : null; };
export function volatility(contracts: Contract[], spot: number) {
  const good = contracts.filter(c => c.iv !== null && c.volume >= 5 && c.oi >= 5 && c.price !== null && c.price > 0);
  const at = good.filter(c=>Math.abs(c.strike / spot - 1) <= .025).sort((a,b)=>Math.abs(a.strike-spot)-Math.abs(b.strike-spot));
  const calls = at.filter(c=>c.side==="CALL").slice(0,3), puts = at.filter(c=>c.side==="PUT").slice(0,3);
  const atm = calls.length && puts.length ? median([...calls,...puts].map(c=>c.iv!)) : null;
  const downside = good.filter(c=>c.side==="PUT" && c.strike < spot && Math.abs(c.strike/spot-.95)<=.015).sort((a,b)=>Math.abs(a.strike/spot-.95)-Math.abs(b.strike/spot-.95)).slice(0,3);
  const putIv = downside.length >= 2 ? median(downside.map(c=>c.iv!)) : null;
  return { atm, putIv, skew: atm !== null && putIv !== null ? putIv-atm : null, usable: good.length, total: contracts.length, move5: atm !== null ? atm/100*Math.sqrt(5/252)*100 : null };
}
export function flowRows(flow: Record<string, Raw>, weekly: "monday" | "thursday" = "thursday") {
  return [{ key:"frgn",name:"외국인",hint:"해외 투자자 합산" },{ key:"prsn",name:"개인",hint:"국내 개인 투자자" },{ key:"orgn",name:"기관계",hint:"금융투자 등을 포함한 합계" },{ key:"scrt",name:"금융투자",hint:"기관계에 포함 · 중복 합산 금지" }].map(g=>({ ...g, futures:number(flow.futures?.[g.key+"_ntby_qty"]), call:number(flow.call?.[g.key+"_ntby_qty"]), put:number(flow.put?.[g.key+"_ntby_qty"]), weeklyCall:number(flow[weekly+"Call"]?.[g.key+"_ntby_qty"]), weeklyPut:number(flow[weekly+"Put"]?.[g.key+"_ntby_qty"]) }));
}
export function interpretation(flow: Record<string, Raw>) {
  const r=flowRows(flow)[0], f=r.futures, c=r.call, p=r.put;
  if (f===null || c===null || p===null) return { title:"자료를 더 확인하고 있습니다", label:"판단 유보", tone:"neutral", note:"수급 자료 일부가 없어 방향성 해석을 보류합니다.", evidence:["누락된 수급 자료를 새로 확인하세요."], contrary:"조회가 끝난 자료부터 개별적으로 확인할 수 있습니다.", watch:"자료가 모두 연결되면 수급의 일치 여부를 다시 확인하세요." };
  if(f>0 && c>=0 && p<=0) return {title:"상승 쪽 수급이 겹쳐 보입니다",label:"상승 수급 우세",tone:"up",note:"외국인 선물·월간 옵션 순매수의 부호가 같은 방향을 가리킵니다.",evidence:["외국인 선물 순매수", "월간 콜 순매수 · 풋 순매도"],contrary:"옵션 거래에는 기존 계약 청산과 헤지가 섞일 수 있어 보유 포지션은 확정할 수 없습니다.",watch:"선물 수급이 순매도로 바뀌거나 하락 대비 비용이 높아지면 해석을 재검토하세요."};
  if(f<0 && c<=0 && p>=0) return {title:"하락 쪽 수급이 겹쳐 보입니다",label:"하락 수급 우세",tone:"down",note:"외국인 선물·월간 옵션 순매수의 부호가 같은 방향을 가리킵니다.",evidence:["외국인 선물 순매도", "월간 콜 순매도 · 풋 순매수"],contrary:"순매도는 기존 매수 계약 청산일 수도 있으며, 풋 매수는 보유 자산의 보험일 수도 있습니다.",watch:"선물 매도가 약해지고 하락 대비 비용이 낮아지면 해석을 재검토하세요."};
  return {title:f>0?"선물은 매수, 옵션의 방향은 다릅니다":"수급의 방향이 한곳으로 모이지 않습니다",label:"근거 혼재",tone:"mixed",note:"선물과 옵션 수급을 함께 보면, 단일 방향의 베팅으로 단정하기 어렵습니다.",evidence:[`외국인 선물 ${f>0?"순매수":f<0?"순매도":"중립"}`,`월간 콜 ${c>0?"순매수":c<0?"순매도":"중립"} · 풋 ${p>0?"순매수":p<0?"순매도":"중립"}`],contrary:"상승 기대와 손실 대비, 기존 계약의 청산이 함께 나타날 수 있습니다. 같은 투자자의 조합인지는 알 수 없습니다.",watch:"선물과 월간·주간 옵션이 같은 방향으로 바뀌는지, 하락 대비 비용이 커지는지 확인하세요."};
}
export function buildDashboard(raw: RawBundle) {
  const contracts=normalize(raw.options), spot=number(raw.index.CLSPRC_IDX)??0;
  const expiries=(product:Product)=>[...new Set(contracts.filter(c=>c.product===product).map(c=>c.expiry))].sort();
  const defaultExpiry=expiries("monthly")[0];
  const history=raw.history.map(p=>({date:p.date,close:p.close,changePct:p.changePct,low:p.low??null,high:p.high??null,kospiLow:p.kospiLow??null,kospiHigh:p.kospiHigh??null,kospiClose:p.kospiClose??null,kospiChangePct:p.kospiChangePct??null,...(p.metrics && p.expiry===defaultExpiry ? p.metrics : volatility(normalize(p.options||[]).filter(c=>c.product==="monthly" && c.expiry===defaultExpiry),p.close))}));
  const kospiClose=number(raw.kospi?.CLSPRC_IDX);
  const kospi=raw.kospiDate===raw.krxDate && kospiClose!==null && kospiClose>0 ? {date:raw.kospiDate,close:kospiClose,changePct:number(raw.kospi?.FLUC_RT),low:number(raw.kospi?.LWPR_IDX),high:number(raw.kospi?.HGPR_IDX)}:null;
  const market={source:raw.marketSource??'KRX',date:raw.krxDate,capturedAt:raw.marketCapturedAt??raw.generatedAt,session:raw.marketSource==='KIS'?(raw.marketSession??'intraday'):'confirmed',rangePct:raw.optionRangePct??20};
  return { generatedAt:raw.generatedAt, market,low:number(raw.index.LWPR_IDX),high:number(raw.index.HGPR_IDX),kospi, krxDate:raw.krxDate, flowAt:raw.flow.queriedAt, spot, change: number(raw.index.CMPPREVDD_IDX), changePct:number(raw.index.FLUC_RT), contracts, expiries:{monthly:expiries("monthly"),monday:expiries("monday"),thursday:expiries("thursday")}, history, flow:raw.flow.data, view:interpretation(raw.flow.data), us:raw.us, sources:[{name:market.source,date:raw.krxDate,kind:market.source==="KRX"?"정규장 일별 확정자료":market.session==="after_close"?"장마감 시세 스냅샷 · KRX 확정 전":"장중 시세 스냅샷"},{name:"KIS",date:raw.flow.queriedAt,kind:"조회 시점의 시장별 누적 수급"},{name:"Cboe",date:raw.us?.spy?.timestamp,kind:"미국 지연 옵션 스냅샷"}] };
}
export type DashboardData = ReturnType<typeof buildDashboard>;
export type Observation = { id:string; date:string; capturedAt:number; title:string; payload:string };
export function followupReturn(observedDate:string,history:{date:string;close:number}[],days:number) {
  const sorted=[...history].sort((a,b)=>a.date.localeCompare(b.date));
  const i=sorted.findIndex(h=>h.date===observedDate.replaceAll("-",""));
  if(i<0 || !sorted[i+days]) return null;
  return (sorted[i+days].close/sorted[i].close-1)*100;
}

export function compactBundle(raw: RawBundle): RawBundle {
  const spot=number(raw.index.CLSPRC_IDX)??0;
  const all=normalize(raw.options);
  const months=[...new Set(all.filter(c=>c.product==="monthly").map(c=>c.expiry))].sort().slice(0,4);
  const allowed=new Set(all.filter(c=>c.strike>=spot*.8&&c.strike<=spot*1.2&&(c.product!=="monthly"||months.includes(c.expiry))).map(c=>c.code));
  const keys=["PROD_NM","RGHT_TP_NM","ISU_CD","ISU_NM","TDD_CLSPRC","IMP_VOLT","ACC_TRDVOL","ACC_OPNINT_QTY","OPNINT_CHANGE"];
  const options=raw.options.filter(r=>allowed.has(r.ISU_CD)&&r.ISU_NM.includes("(정규)")).map(r=>Object.fromEntries(keys.map(k=>[k,r[k]??""])));
  const history=raw.history.map(p=>p.metrics?{...p,options:[]}:{date:p.date,close:p.close,changePct:p.changePct,low:p.low??null,high:p.high??null,kospiLow:p.kospiLow??null,kospiHigh:p.kospiHigh??null,kospiClose:p.kospiClose??null,kospiChangePct:p.kospiChangePct??null,options:[],expiry:months[0],metrics:volatility(normalize(p.options).filter(c=>c.product==="monthly"&&c.expiry===months[0]),p.close)});
  const us={...raw.us};
  for(const key of ["spy","qqq"]){if(!us[key])continue;us[key]={...us[key],options:us[key].options.slice(0,500).map((o:any)=>Object.fromEntries(["option","bid","ask","iv","open_interest","volume","delta"].map(k=>[k,o[k]])))};}
  return {...raw,options,history,us};
}
