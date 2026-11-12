import type { DashboardData, Product } from './model.ts';
export type IndexMode='k200'|'kospi';
export type LevelMetric='oi'|'volume';
export function proxyRatio(data:Pick<DashboardData,'spot'|'kospi'|'krxDate'>):number|null {
  const k=data.kospi;
  if(!k || k.date!==data.krxDate || !Number.isFinite(k.close) || k.close<=0 || !Number.isFinite(data.spot) || data.spot<=0)return null;
  return k.close/data.spot;
}
export function optionLevelMap(data:DashboardData,mode:IndexMode,product:Product,expiry:string,metric:LevelMetric,days=10) {
  const ratio=proxyRatio(data);
  const effectiveMode:IndexMode=mode==='kospi'&&ratio!==null?'kospi':'k200';
  const factor=effectiveMode==='kospi'?ratio!:1;
  const expiryList=data.expiries[product];
  const selectedExpiry=expiryList.includes(expiry)?expiry:expiryList[0]??'';
  const strikes=new Map<number,{strike:number;level:number;call:number;put:number}>();
  for(const c of data.contracts){
    if(c.product!==product || c.expiry!==selectedExpiry || Math.abs(c.strike/data.spot-1)>.08+1e-9)continue;
    const row=strikes.get(c.strike)??{strike:c.strike,level:c.strike*factor,call:0,put:0};
    const value=metric==='oi'?c.oi:c.volume;
    row[c.side==='CALL'?'call':'put']+=Number.isFinite(value)?Math.max(0,value):0;
    strikes.set(c.strike,row);
  }
  const profile=[...strikes.values()].sort((a,b)=>a.strike-b.strike);
  const references=(['call','put'] as const).flatMap(side=>{
    const winner=[...profile].filter(p=>p[side]>0).sort((a,b)=>b[side]-a[side] || Math.abs(a.strike-data.spot)-Math.abs(b.strike-data.spot))[0];
    return winner?[{side,...winner}]:[];
  });
  const history=data.history.slice(-days).map(p=>({date:p.date,value:effectiveMode==='kospi'?p.kospiClose:p.close,changePct:effectiveMode==='kospi'?p.kospiChangePct:p.changePct,low:effectiveMode==='kospi'?p.kospiLow:p.low,high:effectiveMode==='kospi'?p.kospiHigh:p.high}));
  return {mode:effectiveMode,ratio,factor,expiry:selectedExpiry,profile,references,history,spot:effectiveMode==='kospi'?data.kospi!.close:data.spot,changePct:effectiveMode==='kospi'?data.kospi!.changePct:data.changePct};
}
