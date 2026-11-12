"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { flowRows, PRODUCT_LABELS, type DashboardData, type Product } from '../../lib/model';
import { optionLevelMap, proxyRatio, type IndexMode, type LevelMetric } from '../../lib/levels';
import OrderFlowPanel from './OrderFlowPanel';
const format=(n:number,d=0)=>n.toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d});
const short=(s:string)=>`${Number(s.slice(4,6))}/${Number(s.slice(6,8))}`;
const time=(s:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
const colors={index:'var(--chart-index)',call:'var(--chart-call)',put:'var(--chart-put)'};
function useWidth(ref:RefObject<HTMLDivElement|null>,initial:number){
 const [width,setWidth]=useState(initial);
 useEffect(()=>{const node=ref.current;if(!node)return;const update=()=>setWidth(node.getBoundingClientRect().width);const observer=new ResizeObserver(update);observer.observe(node);update();return()=>observer.disconnect();},[ref]);
 return width;
}
export default function OptionMap({data}:{data:DashboardData}){
 const [mode,setMode]=useState<IndexMode>(proxyRatio(data)!==null?'kospi':'k200');
 const [product,setProduct]=useState<Product>('monthly'),[expiry,setExpiry]=useState(''),[metric,setMetric]=useState<LevelMetric>('oi'),[days,setDays]=useState(10);
 const [visible,setVisible]=useState({call:true,put:true}),[selected,setSelected]=useState<number|null>(null),[hover,setHover]=useState<number|null>(null);
 const priceRef=useRef<HTMLDivElement>(null),profileRef=useRef<HTMLDivElement>(null),flowRef=useRef<HTMLDivElement>(null);
 const width=useWidth(priceRef,620),profileWidth=useWidth(profileRef,310),flowWidth=useWidth(flowRef,900);
 const map=useMemo(()=>optionLevelMap(data,mode,product,expiry,metric,days),[data,mode,product,expiry,metric,days]);
 const ratio=proxyRatio(data),isKospi=map.mode==='kospi';
 const name=isKospi?'코스피':'코스피200';
 const metricName=metric==='oi'?'미결제약정':'거래량';
 useEffect(()=>{if(!map.profile.some(p=>p.strike===selected))setSelected(null);},[map.profile,selected]);
 const allValues=[...map.history.flatMap(p=>[p.value,p.low,p.high].filter((v):v is number=>typeof v==='number'&&Number.isFinite(v))),...map.profile.map(p=>p.level),map.spot];
 const low=Math.min(...allValues),high=Math.max(...allValues),pad=Math.max((high-low)*.07,map.spot*.006);
 const minimum=low-pad,maximum=high+pad;
 const h=width<400?350:410,top=32,bottom=h-55,left=width<350?56:66,right=Math.max(left+10,width-22);
 const y=(v:number)=>bottom-8-(v-minimum)/(maximum-minimum)*(bottom-top-16);
 const x=(i:number)=>left+8+i/Math.max(1,map.history.length-1)*(right-left-16);
 const rawStep=(maximum-minimum)/5,base=10**Math.floor(Math.log10(rawStep));
 const step=[1,2,5,10].map(n=>n*base).sort((a,b)=>Math.abs(a-rawStep)-Math.abs(b-rawStep))[0];
 const ticks=Array.from({length:Math.max(1,Math.floor(maximum/step)-Math.ceil(minimum/step)+1)},(_,i)=>(Math.ceil(minimum/step)+i)*step);
 const tickPrice=(v:number)=>format(v,isKospi?0:0);
 let path='',active=false;
 for(let i=0;i<map.history.length;i++){const p=map.history[i];if(typeof p.value!=='number'||!Number.isFinite(p.value)){active=false;continue;}path+=`${active?'L':'M'}${x(i)},${y(p.value)} `;active=true;}
 const shownPoint=map.history[hover??map.history.length-1];
 const picked=map.profile.find(p=>p.strike===selected);
 const maxCount=Math.max(1,...map.profile.flatMap(p=>[visible.call?p.call:0,visible.put?p.put:0]));
 const pl=profileWidth<300?54:64,pr=profileWidth-20,zero=(pl+pr)/2,half=(pr-pl)/2-6;
 const countX=(v:number)=>zero+v/maxCount*half;
 const barHeight=Math.max(1.5,Math.abs(y(map.spot)-y(map.spot+2.5*map.factor))-1.2);
 const refs=map.references.filter(r=>visible[r.side]);
 const row=flowRows(data.flow)[0];
 const flows=[{name:'선물',value:row.futures,color:colors.index,hint:row.futures===null?'자료 없음':row.futures===0?'변화 없음':row.futures>0?'매수 · 상승 방향':'매도 · 하락 방향'},{name:'월간 콜',value:row.call,color:colors.call,hint:row.call===null?'자료 없음':row.call===0?'변화 없음':row.call>0?'매수 · 상승 방향':'매도 · 상승 노출 축소'},{name:'월간 풋',value:row.put,color:colors.put,hint:row.put===null?'자료 없음':row.put===0?'변화 없음':row.put>0?'매수 · 하락 대비':'매도 · 하락 위험 부담'}];
 const fmax=Math.max(1,...flows.map(f=>Math.abs(f.value??0))),fl=55,fr=flowWidth-20,fw=(fr-fl)/3;
 const flowY=(n:number)=>90-n/fmax*54;
 const labels=refs.map(r=>({r,y:y(r.level)-8})).sort((a,b)=>a.y-b.y);
 if(labels.length===2 && labels[1].y-labels[0].y<18)labels[1].y=labels[0].y+18;
 const selectionText=picked?`${isKospi?'코스피 환산 약 '+format(picked.level)+' · ':''}원래 행사가 ${format(picked.strike,1)} · 콜 ${format(picked.call)} / 풋 ${format(picked.put)}계약`:refs.map(r=>`${isKospi?'약 '+format(r.level)+' (행사가 '+format(r.strike)+')':format(r.strike)} ${r.side==='call'?'콜':'풋'} 집중`).join(' / ');
 return <section className="bet-map" aria-labelledby="bet-title">
  <div className="bet-heading"><div><h2 id="bet-title">{name} · 옵션 집중 가격대{isKospi&&<span className="bet-proxy-tag">환산 참고선</span>}</h2><p>{data.market.source} {short(data.krxDate)} {data.market.source==='KRX'?'정규장 확정':data.market.session==='after_close'?'장마감 시세':'장중 시세'} · {PRODUCT_LABELS[product]} {map.expiry} · 최근 종가 ±8%</p></div><div className="bet-segment" aria-label="차트 지수"><button type="button" aria-pressed={isKospi} onClick={()=>setMode('kospi')} disabled={ratio===null}>코스피</button><button type="button" aria-pressed={!isKospi} onClick={()=>setMode('k200')}>코스피200</button></div></div>
  <div className="bet-toolbar"><div className="bet-legend"><span><i style={{background:colors.index}}/>{name} 종가</span>{(['call','put'] as const).map(side=><button type="button" key={side} aria-pressed={visible[side]} onClick={()=>setVisible(v=>({...v,[side]:!v[side]}))}><i style={{background:colors[side]}}/>{side==='call'?'콜':'풋'} {metricName}</button>)}</div><div className="bet-segment" aria-label="차트 기간">{[10,20].map(n=><button type="button" key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>{n}일</button>)}</div></div>
  <div className="bet-day-range"><span>최근 종가 <strong>{format(map.spot,2)}</strong> {map.changePct!==null?`(${map.changePct>0?'+':''}${format(map.changePct,2)}%)`:''}</span>{(isKospi?data.kospi?.low:data.low)!=null&&<span>장중 저점 <strong>{format((isKospi?data.kospi!.low:data.low)!,2)}</strong></span>}{(isKospi?data.kospi?.high:data.high)!=null&&<span>고점 {format((isKospi?data.kospi!.high:data.high)!,2)}</span>}</div>
  <div className="bet-map-grid">
   <div className="bet-price" ref={priceRef}><svg width="100%" height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`${name} 실제 종가와 ${isKospi?'코스피200 옵션 환산 집중선':'옵션 집중선'}`}>
    <text x={left} y={17}>{name} (pt)</text><rect className="bet-frame" x={left} y={top} width={right-left} height={bottom-top}/>
    {ticks.map(v=><g key={v}><line className="bet-grid" x1={left} x2={right} y1={y(v)} y2={y(v)}/><text x={left-9} y={y(v)+4} textAnchor="end">{tickPrice(v)}</text></g>)}
    {refs.map(r=><g key={r.side}><rect x={left+1} width={right-left-2} y={y(r.level+map.factor*.65)} height={Math.max(3,y(r.level-map.factor*.65)-y(r.level+map.factor*.65))} fill={colors[r.side]} opacity={.09}/><line className="bet-level" data-side={r.side} x1={left} x2={right} y1={y(r.level)} y2={y(r.level)} stroke={colors[r.side]} strokeDasharray="6 4"/></g>)}
    {labels.map(({r,y:labelY})=><text key={r.side} x={left+7} y={Math.min(bottom-6,Math.max(top+15,labelY))}>{isKospi?'≈ '+format(r.level):format(r.strike)} {r.side==='call'?'콜':'풋'} 집중</text>)}
    {picked&&<line className="bet-picked-line" x1={left} x2={right} y1={y(picked.level)} y2={y(picked.level)}/>}<path className="bet-index-path" d={path} fill="none" stroke={colors.index} strokeWidth={2.5}/>
    {map.history.map((p,i)=>typeof p.low==='number'&&typeof p.high==='number'?<line key={'range-'+p.date} className="bet-day-wick" x1={x(i)} x2={x(i)} y1={y(p.low)} y2={y(p.high)} stroke={colors.index} strokeWidth={1.5} opacity={.6}/>:null)}
    {map.history.map((p,i)=>typeof p.value==='number'&&Number.isFinite(p.value)?<g key={p.date}><circle cx={x(i)} cy={y(p.value)} r={3.4} fill={colors.index}/><circle className="bet-point-hit" data-chart-hit="price" cx={x(i)} cy={y(p.value)} r={16} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onClick={()=>setHover(i)}><title>{short(p.date)} 종가 {format(p.value,2)} · {p.changePct===null?'':format(p.changePct,2)+'%'}</title></circle></g>:null)}
    {shownPoint&&typeof shownPoint.value==='number'&&<text x={right-4} y={Math.min(bottom-7,y(shownPoint.value)+22)} textAnchor="end">{format(shownPoint.value,2)}{shownPoint.changePct!==null&&shownPoint.changePct!==undefined?` (${shownPoint.changePct>0?'+':''}${format(shownPoint.changePct,2)}%)`:''}</text>}
    {Array.from({length:width<400?3:4},(_,i)=>Math.round((map.history.length-1)*i/(width<400?2:3))).filter((v,i,a)=>a.indexOf(v)===i).map(i=>map.history[i]&&<text key={i} x={x(i)} y={bottom+23} textAnchor={i===0?'start':i===map.history.length-1?'end':'middle'}>{short(map.history[i].date)}</text>)}<text x={(left+right)/2} y={h-6} textAnchor="middle">거래일</text>
   </svg></div>
   <div className="bet-profile" ref={profileRef}><svg width="100%" height={h} viewBox={`0 0 ${profileWidth} ${h}`} role="img" aria-label={`행사가별 시장 전체 ${metricName} · ${isKospi?'코스피 환산':'코스피200'} 가격 축`}>
    <text x={pl} y={17}>{isKospi?'환산 지수':'행사가'} (pt)</text><rect className="bet-frame" x={pl} y={top} width={pr-pl} height={bottom-top}/>{ticks.map(v=><text key={v} x={pl-9} y={y(v)+4} textAnchor="end">{tickPrice(v)}</text>)}<line className="bet-grid" x1={zero} x2={zero} y1={top} y2={bottom}/>
    {map.profile.map(p=><g key={p.strike}>{visible.call&&p.call>0&&<rect className="bet-call-bar" x={countX(-p.call)} y={y(p.level)-barHeight/2} width={zero-countX(-p.call)} height={barHeight} fill={colors.call} opacity={selected===p.strike?1:.67}/>} {visible.put&&p.put>0&&<rect className="bet-put-bar" x={zero} y={y(p.level)-barHeight/2} width={countX(p.put)-zero} height={barHeight} fill={colors.put} opacity={selected===p.strike?1:.67}/>}</g>)}
    {refs.map(r=><text key={r.side} x={r.side==='call'?pl+4:pr-4} y={Math.max(top+14,y(r.level)-8)} textAnchor={r.side==='call'?'start':'end'}>{format(r[r.side])}계약</text>)}
    <rect className="bet-profile-hit" x={pl} y={top} width={pr-pl} height={bottom-top} onClick={e=>{const rect=e.currentTarget.ownerSVGElement!.getBoundingClientRect();const py=(e.clientY-rect.top)*h/rect.height;const level=minimum+(bottom-8-py)/(bottom-top-16)*(maximum-minimum);const p=[...map.profile].sort((a,b)=>Math.abs(a.level-level)-Math.abs(b.level-level))[0];if(p)setSelected(p.strike);}}><title>가격대를 누르면 해당 행사가의 계약수를 표시합니다.</title></rect>
    <text x={pl} y={bottom+23}>{format(maxCount/1000,1)}천</text><text x={zero} y={bottom+23} textAnchor="middle">0</text><text x={pr} y={bottom+23} textAnchor="end">{format(maxCount/1000,1)}천</text><text x={(pl+pr)/2} y={h-6} textAnchor="middle">← 콜 · 계약수 · 풋 →</text>
   </svg></div>
  </div>
  <div className="bet-selection"><label>행사가<select aria-label="차트 행사가 선택" value={selected??''} onChange={e=>setSelected(e.target.value===''?null:Number(e.target.value))}><option value="">집중 구간</option>{map.profile.map(p=><option value={p.strike} key={p.strike}>{format(p.strike,1)}{isKospi?` → 약 ${format(p.level)}`:''}</option>)}</select></label><p aria-live="polite">{selectionText||'이 범위에 표시할 계약이 없습니다.'}</p></div>
  <div className="bet-filter-row"><label>상품<select aria-label="집중선 상품" value={product} onChange={e=>{setProduct(e.target.value as Product);setExpiry('');setSelected(null);}}>{Object.entries(PRODUCT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>만기<select aria-label="집중선 만기" value={map.expiry} onChange={e=>{setExpiry(e.target.value);setSelected(null);}}>{data.expiries[product].map(v=><option key={v} value={v}>{v}</option>)}</select></label><div className="bet-segment" aria-label="집중선 기준"><button type="button" aria-pressed={metric==='oi'} onClick={()=>setMetric('oi')}>남은 계약</button><button type="button" aria-pressed={metric==='volume'} onClick={()=>setMetric('volume')}>오늘 거래량</button></div></div>
  <OrderFlowPanel data={data} product={product} expiry={map.expiry} selected={selected} onSelect={setSelected}/>
  <div className="bet-flow-heading"><h3>외국인은 어느 쪽으로 거래했나</h3><span>KIS {time(data.flowAt)} 조회 · 월간 옵션 · 계약</span></div>
  <div ref={flowRef} className="bet-flow-chart"><svg width="100%" height={205} viewBox={`0 0 ${flowWidth} 205`} role="img" aria-label="외국인 선물 및 월간 콜 풋 순매수와 거래 방향">
   <text x={fl} y={17}>순매수 (계약)</text><rect className="bet-frame" x={fl} y={28} width={fr-fl} height={130}/><line className="bet-grid" x1={fl} x2={fr} y1={90} y2={90}/><text x={fl-10} y={94} textAnchor="end">0</text>
   {flows.map((f,i)=>{const cx=fl+fw*(i+.5),bw=Math.min(80,fw*.34),v=f.value??0;return <g key={f.name}><rect x={cx-bw/2} y={v>0?flowY(v):90} width={bw} height={Math.abs(flowY(v)-90)} fill={f.color}/><text x={cx} y={v>=0?flowY(v)-8:flowY(v)+16} textAnchor="middle">{f.value===null?'자료 없음':`${v>0?'+':''}${format(v)}`}</text><text x={cx} y={177} textAnchor="middle">{f.name}</text><text x={cx} y={199} textAnchor="middle">{flowWidth<500?f.hint.replace('매수 · ','').replace('매도 · ',''):f.hint}</text></g>;})}
  </svg></div>
  <div className="bet-map-foot"><span>집중선: 옵션시장 전체 · 외국인: 수급 합계</span>{isKospi&&ratio!==null&&<span>{short(data.krxDate)} 종가 비율로 환산 · ×{format(ratio,4)}</span>}<details><summary>선의 기준</summary><p>{isKospi?'코스피 차트는 실제 종가입니다. 옵션 행사가에 같은 날 코스피 종가 ÷ 코스피200 종가를 곱해 고정된 참고선을 그립니다. ':''}선택 만기의 지수 ±8% 범위에서 콜·풋별 {metricName}이 가장 많은 행사가를 표시합니다. 외국인의 행사가별 보유량이나 확정 지지·저항을 뜻하지 않습니다.</p></details></div>
 </section>;
}
