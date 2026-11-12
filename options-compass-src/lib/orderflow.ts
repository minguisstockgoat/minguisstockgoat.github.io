/** Market-wide options flow. Never attribute anonymous prints or quotes to foreigners. */
export type BookLevel={price:number;quantity:number};
export type TradeFlow={at:string;volume:number;buy:number;sell:number;unknown:number};
export type BookSample={at:string;bid:number;ask:number};
export type OrderBook={at:string;exchangeTime:string;bids:BookLevel[];asks:BookLevel[];samples:BookSample[]};
export type FlowContract={code:string;shortCode:string;product:'monthly'|'monday'|'thursday';expiry:string;strike:number;side:'CALL'|'PUT';at:string;price:number|null;volume:number;oi:number;oiChange:number|null;trade:TradeFlow|null;book:OrderBook|null};
export type OrderFlowData={version:1;date:string;capturedAt:string;startedAt:string;session:'intraday'|'after_close';collector:'starting'|'running'|'waiting'|'reconnecting';trackedCodes:string[];contracts:FlowContract[]};
export function tradeBreakdown(volume:number,buy:number,sell:number):TradeFlow|null {
 if(![volume,buy,sell].every(n=>Number.isSafeInteger(n)&&n>=0)||buy+sell>volume)return null;
 return {at:'',volume,buy,sell,unknown:volume-buy-sell};
}
export function bookTotals(book:OrderBook|null){
 if(!book)return null;
 return {bid:book.bids.reduce((n,l)=>n+l.quantity,0),ask:book.asks.reduce((n,l)=>n+l.quantity,0)};
}
export function bookTrend(book:OrderBook|null){
 const samples=book?.samples??[];
 if(samples.length<3)return null;
 const elapsed=Date.parse(samples.at(-1)!.at)-Date.parse(samples[0].at);
 if(elapsed<120000)return null;
 const bid=samples.reduce((n,s)=>n+s.bid,0)/samples.length,ask=samples.reduce((n,s)=>n+s.ask,0)/samples.length;
 return {bid,ask,minutes:Math.round(elapsed/60000),count:samples.length};
}
export function flowReading(row:FlowContract,now=new Date()):string {
 const t=row.trade;
 if(!t)return `${row.side==='CALL'?'콜':'풋'} ${row.strike}: 체결 방향은 장중 수집 후 표시합니다.`;
 if(Date.parse(t.at)>now.getTime()+60000 || (row.at.slice(0,10)!==t.at.slice(0,10)))return '체결 기준 시각을 다시 확인하고 있습니다.';
 const classified=t.buy+t.sell,coverage=t.volume?classified/t.volume:0;
 if(!classified||coverage<.5)return `${row.side==='CALL'?'콜':'풋'} ${row.strike}: 분류된 체결이 부족합니다.`;
 const ratio=t.buy/classified;
 const direction=ratio>=.6?'매수 주도':ratio<=.4?'매도 주도':'매수·매도 혼재';
 const change=row.oiChange===null?'':row.oiChange>0?' · 남은 계약 증가':row.oiChange<0?' · 남은 계약 감소':' · 남은 계약 변화 없음';
 return `${row.side==='CALL'?'콜':'풋'} ${row.strike}: ${direction}${change}`;
}
