import { snapshotFetch as fetch } from "../../snapshot-client";
"use client";
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { bookTotals, bookTrend, flowReading, type OrderFlowData, type FlowContract } from '../../lib/orderflow';
import type { DashboardData, Product } from '../../lib/model';
const fmt=(n:number|null|undefined,d=0)=>n==null?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:d});
const signed=(n:number|null|undefined)=>n==null?'비교 자료 없음':`${n>0?'+':''}${fmt(n)}계약`;
const time=(s:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
export default function OrderFlowPanel({data,product,expiry,selected,onSelect}:{data:DashboardData;product:Product;expiry:string;selected:number|null;onSelect:(strike:number)=>void}){
 const [snapshot,setSnapshot]=useState<OrderFlowData|null>(null),[tab,setTab]=useState<'trade'|'oi'|'book'>('oi'),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{
  const controller=new AbortController();let disposed=false;
  setSnapshot(null);setStatus('loading');
  async function load(){try{const r=await fetch(`/api/order-flow?date=${data.krxDate}`,{signal:controller.signal});if(!r.ok)throw new Error();const d:any=await r.json();if(!disposed){setSnapshot(d.data?.date===data.krxDate?d.data:null);setStatus('ready');}}catch{if(!disposed)setStatus('error');}}
  load();const interval=setInterval(()=>{if(document.visibilityState==='visible')load();},60000);
  return()=>{disposed=true;controller.abort();clearInterval(interval);};
 },[data.krxDate]);
 const base=useMemo(()=>data.contracts.filter(c=>c.product===product&&c.expiry===expiry),[data,product,expiry]);
 const strikes=useMemo(()=>[...new Set(base.map(c=>c.strike))].sort((a,b)=>a-b),[base]);
 const highlights=useMemo(()=>{
  const result:number[]=[];
  for(const side of ['CALL','PUT'])for(const key of ['volume','oi'] as const){const rows=base.filter(c=>c.side===side);if(rows.length)result.push([...rows].sort((a,b)=>b[key]-a[key])[0].strike);}
  return [...new Set(result)].slice(0,4);
 },[base]);
 const strike=selected!==null&&strikes.includes(selected)?selected:highlights[0]??strikes[0];
 const detail=snapshot?.contracts.filter(c=>c.product===product&&c.expiry===expiry&&c.strike===strike)??[];
 const rows=base.filter(c=>c.strike===strike).map(c=>({base:c,detail:detail.find(r=>r.code===c.code)}));
 const hasTrades=detail.some(r=>r.trade!==null),hasBooks=detail.some(r=>r.book!==null);
 const now=new Date(),kstDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
 const heartbeatFresh=snapshot&&Date.now()-Date.parse(snapshot.capturedAt)<180000&&data.krxDate===kstDate;
 const badge=snapshot?.session==='after_close'?'장마감 자료':heartbeatFresh&&snapshot.collector==='running'?'장중 수집 중':snapshot?.collector==='reconnecting'?'연결 재시도 중':'장중 수집 대기';
 const bookCard=(r:FlowContract|undefined,side:string)=>{
  const q=r?.book??null,totals=bookTotals(q),trend=bookTrend(q);
  return <div className="orderflow-book" key={side}><h4>{side==='CALL'?'콜':'풋'} {fmt(strike)}</h4>{q&&totals?<>
   <p className="orderflow-asof">{time(q.at)} 호가 · 옵션 가격 기준 · 상위 5단계</p>
   <div className="orderflow-book-totals"><span>매수 대기 <strong>{fmt(totals.bid)}<small>계약</small></strong></span><span>매도 대기 <strong>{fmt(totals.ask)}<small>계약</small></strong></span></div>
   <div className="orderflow-book-bar" aria-label={`매수 대기 ${totals.bid}, 매도 대기 ${totals.ask}계약`}><i style={{width:`${totals.bid/Math.max(1,totals.bid+totals.ask)*100}%`}}/><i style={{flex:1}}/></div>
   <p className="orderflow-mini">{trend?`최근 ${trend.minutes}분 · ${trend.count}회 관측 평균: 매수 ${fmt(trend.bid)} / 매도 ${fmt(trend.ask)}계약`:'잔량 추이: 장중 3회 이상 관측 후 표시'}</p>
   <details><summary>5단계 호가 펼치기 <ChevronDown size={13}/></summary><div className="table-scroll"><table><thead><tr><th>매수 잔량</th><th>매수 가격</th><th>매도 가격</th><th>매도 잔량</th></tr></thead><tbody>{Array.from({length:5},(_,i)=><tr key={i}><td>{fmt(q.bids[i]?.quantity)}</td><td>{fmt(q.bids[i]?.price,2)}</td><td>{fmt(q.asks[i]?.price,2)}</td><td>{fmt(q.asks[i]?.quantity)}</td></tr>)}</tbody></table></div></details>
  </>:<p className="orderflow-empty">이 종목의 호가는 아직 수집되지 않았습니다.</p>}</div>;
 };
 return <section className="orderflow-panel" aria-labelledby="orderflow-title">
  <div className="orderflow-heading"><div><h3 id="orderflow-title">거래 방향 더 보기</h3><p>행사가별 시장 전체 거래 · 외국인 수급은 아래에서 확인</p></div><span className={`orderflow-status ${heartbeatFresh&&snapshot?.collector==='running'?'is-live':''}`}>{status==='loading'?<><RefreshCw size={12} className="spinning"/>자료 확인 중</>:badge}</span></div>
  <div className="orderflow-controls"><label>행사가 <select aria-label="거래 방향 행사가" value={strike??''} onChange={e=>onSelect(Number(e.target.value))}>{strikes.map(s=><option key={s} value={s}>{fmt(s,1)}</option>)}</select></label><div className="orderflow-shortcuts">{highlights.map(s=><button key={s} aria-pressed={s===strike} onClick={()=>onSelect(s)}>{fmt(s)}</button>)}</div><div className="bet-segment" aria-label="거래 상세 지표">{([['oi','계약 변화'],['trade','체결 방향'],['book','대기 주문']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div></div>
  {status==='error'&&<p className="orderflow-empty" role="status">새 상세 자료를 받지 못했습니다. 표시된 기준 시각의 자료를 유지하며 다시 확인합니다.</p>}
  {tab==='oi'&&<><div className="table-scroll"><table className="orderflow-table"><thead><tr><th>선택 옵션</th><th>남은 계약</th><th>전일 대비</th><th>오늘 거래량</th></tr></thead><tbody>{rows.map(({base:c,detail:r})=><tr key={c.code}><th><i className={c.side==='CALL'?'of-call':'of-put'}/>{c.side==='CALL'?'콜':'풋'} {fmt(c.strike)}</th><td>{fmt(r?.oi??c.oi)}</td><td><span className={(r?.oiChange??c.oiChange)==null?'muted':(r?.oiChange??c.oiChange)!>0?'of-increase':(r?.oiChange??c.oiChange)!<0?'of-decrease':'muted'}>{signed(r?.oiChange??c.oiChange)}</span></td><td>{fmt(r?.volume??c.volume)}</td></tr>)}</tbody></table></div><p className="orderflow-reading">{detail.some(r=>r.oiChange!=null)?detail.filter(r=>r.oiChange!=null).map(r=>`${r.side==='CALL'?'콜':'풋'} ${r.oiChange!>0?'계약 증가':r.oiChange!<0?'계약 감소':'계약 유지'}`).join(' · '):'전일 비교 자료를 수집하면 계약의 증가·감소를 표시합니다.'}</p></>}
  {tab==='trade'&&<>{hasTrades?<><div className="table-scroll"><table className="orderflow-table"><thead><tr><th>선택 옵션</th><th>매수 주도</th><th>매도 주도</th><th>미분류</th></tr></thead><tbody>{rows.map(({base:c,detail:r})=><tr key={c.code}><th><i className={c.side==='CALL'?'of-call':'of-put'}/>{c.side==='CALL'?'콜':'풋'} {fmt(c.strike)}</th><td>{fmt(r?.trade?.buy)}</td><td>{fmt(r?.trade?.sell)}</td><td>{fmt(r?.trade?.unknown)}</td></tr>)}</tbody></table></div><div className="orderflow-readings">{detail.filter(r=>r.trade).map(r=><p key={r.code}>{flowReading(r)}<small>{time(r.trade!.at)} 기준</small></p>)}</div></>:<div className="orderflow-empty"><strong>체결 방향은 장중 수집 후 표시합니다.</strong><p>{snapshot?.trackedCodes.some(code=>rows.some(r=>r.base.code===code))?'이 행사가를 추적하고 있습니다. 다음 체결을 수신하면 표시합니다.':'거래량·남은 계약이 많은 행사가를 우선 추적합니다.'} 오늘 거래량만으로 매수·매도를 추정하지 않습니다.</p></div>}</>}
  {tab==='book'&&<><div className="orderflow-books">{['CALL','PUT'].map(side=>bookCard(detail.find(r=>r.side===side),side))}</div>{hasBooks&&<p className="orderflow-mini">대기 주문은 취소될 수 있습니다. 잔량 추이는 관측한 수량의 평균이며 같은 주문의 지속 여부를 뜻하지 않습니다.</p>}</>}
  <div className="orderflow-foot"><span>{snapshot?`KIS ${time(snapshot.capturedAt)} 수집 · 상세 ${snapshot.contracts.length}종목 / 체결·호가 추적 ${snapshot.trackedCodes.length}종목`:'KIS 상세 자료 수집 대기'}</span><details><summary>숫자 읽는 법</summary><p>{snapshot&&`저장 시작 ${time(snapshot.startedAt)}. `}체결 방향은 KIS의 누적 매수·매도 체결 분류입니다. 매수 주도는 매도호가를 받아 산 거래, 매도 주도는 매수호가에 판 거래를 가리킵니다. 분류 수량이 서로 맞지 않으면 표시하지 않습니다. 계약 변화는 KIS의 미결제약정 증감이며 신규 매수·매도를 단독으로 확정하지 않습니다. 대기 주문은 선택 옵션의 가격별 상위 5단계 잔량입니다. 수집기가 실행되는 Mac이 켜져 있고 인터넷에 연결돼 있어야 장중 체결과 호가가 저장됩니다. 장마감 후에는 마지막 수신 시각을 확인하세요.</p></details></div>
 </section>;
}
