export type TrendContract={code:string;expiry:string;settlement:'AM'|'PM';side:'CALL'|'PUT';strike:number;volume:number|null;oi:number|null};
export type TrendDay={date:string;spot:number;fetchedAt:string;requestedExpiries:string[];strikes:number[];contracts:TrendContract[]};
export type TrendArchive={version:1;symbol:'SPX';days:TrendDay[];calendar:string[];targetDate:string;targets:string[];pending:number;updatedAt:string|null;error?:string};
export const iso=(date:string)=>date.includes('-')?date:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
export const compact=(date:string)=>date.replaceAll('-','');
export function trackedExpiries(date:string){
 const d=new Date(iso(date)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(5-d.getUTCDay()+7)%7);
 const friday=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+7);const next=d.toISOString().slice(0,10);
 const anchor=new Date(iso(date)+'T12:00:00Z');const monthlies:string[]=[];
 for(let i=0;i<4;i++){const first=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+i,1,12));first.setUTCDate(1+(5-first.getUTCDay()+7)%7+14);const value=first.toISOString().slice(0,10);if(value>=iso(date))monthlies.push(value);}
 return [...new Set([friday,next,monthlies.find(x=>x>next)??monthlies.at(-1)!])].sort();
}
export function strikeGrid(spot:number){const low=Math.floor(spot*.8/25)*25,high=Math.ceil(spot*1.05/25)*25;return Array.from({length:Math.min(90,Math.round((high-low)/25)+1)},(_,i)=>low+i*25);}
export function parseTrendDay(raw:any,date:string,expiries:string[],strikes:number[]):TrendDay{
 const allowed=new Set(strikes),seen=new Set<string>(),contracts:TrendContract[]=[];let spot=0;
 const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 for(let i=0;i<(raw.optionSymbol?.length??0);i++){
  const code=String(raw.optionSymbol[i]),match=/^(SPXW|SPX)(\d{6})([CP])(\d{8})$/.exec(code);if(!match||seen.has(code))continue;
  const expiry=`20${match[2].slice(0,2)}-${match[2].slice(2,4)}-${match[2].slice(4,6)}`,strike=Number(match[4])/1000;
  const stamp=raw.updated?.[i];if(typeof stamp!=='number'||new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(stamp*1000))!==iso(date))continue;
  if(!expiries.includes(expiry)||!allowed.has(strike)||strike<=0)continue;
  const underlying=number(raw.underlyingPrice?.[i]);if(underlying&&underlying>0)spot=underlying;
  contracts.push({code,expiry,settlement:match[1]==='SPXW'?'PM':'AM',side:match[3]==='P'?'PUT':'CALL',strike,volume:number(raw.volume?.[i]),oi:number(raw.openInterest?.[i])});seen.add(code);
 }
 if(!contracts.length||!spot)throw new Error('invalid_trend_snapshot');
 return {date:compact(date),spot,fetchedAt:new Date().toISOString(),requestedExpiries:expiries,strikes,contracts};
}
export function mergeTrendDay(old:TrendDay|undefined,next:TrendDay):TrendDay{
 if(!old)return next;if(old.date!==next.date)throw new Error('date_mismatch');
 const map=new Map(old.contracts.map(c=>[c.code,c]));for(const c of next.contracts)map.set(c.code,c);
 return {...next,requestedExpiries:[...new Set([...old.requestedExpiries,...next.requestedExpiries])].sort(),strikes:[...new Set([...old.strikes,...next.strikes])].sort((a,b)=>a-b),contracts:[...map.values()]};
}
export function seriesFor(archive:TrendArchive,expiry:string,settlement:'AM'|'PM',side:'CALL'|'PUT'){
 const calendar=[...new Set(archive.calendar)].sort(),days=[...archive.days].sort((a,b)=>a.date.localeCompare(b.date));
 return days.filter(d=>d.contracts.some(c=>c.expiry===expiry&&c.settlement===settlement&&c.side===side)).map(day=>{
  const nextDate=calendar[calendar.indexOf(day.date)+1],next=days.find(d=>d.date===nextDate);
  const rows=day.contracts.filter(c=>c.expiry===expiry&&c.settlement===settlement&&c.side===side).map(c=>{
   const after=next?.contracts.find(n=>n.code===c.code);const change=compact(expiry)>day.date&&c.oi!==null&&after?.oi!==null&&after?.oi!==undefined?after.oi-c.oi:null;
   return {...c,oiChange:change,distance:(c.strike/day.spot-1)*100};
  });
  const sum=(key:'volume'|'oi')=>rows.some(r=>r[key]!==null)?rows.reduce((s,r)=>s+(r[key]??0),0):null;
  const otm=rows.filter(r=>r.distance<=0&&r.distance>=-15),otmVolume=otm.reduce((s,r)=>s+(r.volume??0),0);
  const deep=otm.filter(r=>r.distance<=-5).reduce((s,r)=>s+(r.volume??0),0);
  const covers=day.strikes.length>0&&Math.min(...day.strikes)<=day.spot*.85+25&&Math.max(...day.strikes)>=day.spot-25;
  const top=rows.filter(r=>r.volume!==null&&r.volume>0).sort((a,b)=>b.volume!-a.volume!||Math.abs(a.distance)-Math.abs(b.distance))[0]??null;
  return {date:day.date,spot:day.spot,dte:Math.round((Date.parse(expiry+'T12:00:00Z')-Date.parse(iso(day.date)+'T12:00:00Z'))/86400000),rows,volume:sum('volume'),oi:sum('oi'),deepShare:covers&&otmVolume>0?deep/otmVolume:null,weightedDistance:covers&&otmVolume>0?otm.reduce((s,r)=>s+(r.volume??0)*r.distance,0)/otmVolume:null,top};
 });
}
export function unusualRows(series:ReturnType<typeof seriesFor>){
 const latest=series.at(-1);if(!latest)return [];
 return latest.rows.map(row=>{
  const prior=series.slice(0,-1).slice(-5).map(d=>d.rows.find(r=>r.code===row.code)?.volume).filter((v):v is number=>v!==null&&v!==undefined);
  const average=prior.length>=3?prior.reduce((a,b)=>a+b,0)/prior.length:null;
  return {...row,average,samples:prior.length,multiple:average!==null&&average>=100&&row.volume!==null?row.volume/average:null};
 }).sort((a,b)=>(b.multiple??-1)-(a.multiple??-1)||(b.volume??0)-(a.volume??0)).slice(0,8);
}
