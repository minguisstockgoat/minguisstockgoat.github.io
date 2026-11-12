import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Compass, LockKeyhole, LogOut} from 'lucide-react';
import Dashboard from './app/page';
import {fetchEnvelope, unlock, lock} from './snapshot-client';
import './app/globals.css';
import './pages.css';
function App() {
 const [opened,setOpened] = useState(false), [busy,setBusy] = useState(false), [password,setPassword] = useState(''), [error,setError] = useState(''), [published,setPublished] = useState('');
 useEffect(()=>{const sync=(e:Event)=>setPublished((e as CustomEvent<string>).detail);window.addEventListener('options-pages-updated',sync);return()=>window.removeEventListener('options-pages-updated',sync);},[]);
 async function open(e: React.FormEvent) {
  e.preventDefault(); setBusy(true); setError('');
  try { const data = await unlock(password, await fetchEnvelope()); setPublished(data.publishedAt); setPassword(''); setOpened(true); }
  catch(e) { setError(e instanceof Error ? e.message : '자료를 열지 못했습니다.'); }
  finally { setBusy(false); }
 }
 if (opened) return <><div className="pages-strip"><a href="../">← 통합 대시보드</a><span>배포 {new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(published))} · 시장별 자료 기준일은 화면에 표시</span><button onClick={()=>{lock();setOpened(false);}}><LogOut size={13}/>잠그기</button></div><Dashboard/></>;
 return <main className="unlock-page"><section className="unlock-card"><div className="unlock-brand"><Compass size={25}/><span>옵션 나침반</span></div><LockKeyhole size={30} className="unlock-icon"/><h1>내 옵션 대시보드 열기</h1><p>한국·해외 옵션 수급을 한눈에.<br/>전용 비밀번호를 입력해 주세요.</p><form onSubmit={open}><label htmlFor="password">대시보드 비밀번호</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required autoFocus disabled={busy}/><button type="submit" disabled={busy||!password}>{busy?'자료 여는 중…':'대시보드 열기'}</button>{error&&<p role="alert" className="unlock-error">{error}</p>}</form><small>개인용 데이터는 암호화해 보관합니다.</small><a className="unlock-back" href="../">← 통합 대시보드</a></section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
