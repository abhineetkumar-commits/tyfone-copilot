'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import { useState } from 'react';

export default function NavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  if (pathname === '/login') return null;
  const links = [{ href: '/generate', label: 'Generate', icon: '⚡' }, { href: '/chat', label: 'Chat', icon: '◎' }];
  return (
    <>
      <style>{`.nl:hover{color:#fff!important;background:rgba(74,159,212,0.15)!important}.al:hover{color:rgba(255,255,255,0.7)!important}.ub:hover{background:rgba(255,255,255,0.12)!important}.mi:hover{background:#f8fafc!important}.si:hover{background:#fef2f2!important}`}</style>
      <nav style={{background:'linear-gradient(90deg,#08192d,#0f2540 50%,#0a1e38)',borderBottom:'1px solid rgba(74,159,212,0.12)',position:'sticky',top:0,zIndex:100}}>
        <div style={{maxWidth:1200,margin:'0 auto',padding:'0 20px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:56}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <Link href="/generate" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
                <div style={{width:32,height:32,background:'linear-gradient(135deg,#1E3A5F,#2d5a8e)',border:'1px solid rgba(74,159,212,0.4)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 12px rgba(74,159,212,0.15)'}}>
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M8 4v8" stroke="#4A9FD4" strokeWidth="2.2" strokeLinecap="round"/><circle cx="8" cy="12" r="1.8" fill="#4A9FD4"/></svg>
                </div>
                <div style={{display:'flex',alignItems:'baseline',gap:5}}>
                  <span style={{color:'#e2e8f0',fontSize:15,fontWeight:700,letterSpacing:'-0.02em'}}>Tyfone</span>
                  <span style={{color:'rgba(255,255,255,0.2)',fontSize:14}}>·</span>
                  <span style={{color:'#4A9FD4',fontSize:13,fontWeight:600}}>Copilot</span>
                </div>
              </Link>
              <div style={{width:1,height:20,background:'rgba(255,255,255,0.1)',margin:'0 4px'}}/>
              <div style={{display:'flex',alignItems:'center',gap:2}}>
                {links.map(l=>(
                  <Link key={l.href} href={l.href} className="nl" style={{display:'flex',alignItems:'center',gap:5,padding:'5px 11px',borderRadius:8,fontSize:13,fontWeight:500,textDecoration:'none',color:pathname===l.href?'#fff':'rgba(255,255,255,0.5)',background:pathname===l.href?'rgba(74,159,212,0.18)':'transparent',borderBottom:pathname===l.href?'1px solid rgba(74,159,212,0.4)':'1px solid transparent',transition:'all 0.15s'}}>
                    <span style={{fontSize:11,opacity:0.7}}>{l.icon}</span>{l.label}
                  </Link>
                ))}
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <Link href="/admin" className="al" style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'rgba(255,255,255,0.3)',textDecoration:'none',transition:'color 0.15s'}}>
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Admin
              </Link>
              {status==='authenticated'&&session?.user ? (
                <div style={{position:'relative'}}>
                  <button onClick={()=>setMenuOpen(!menuOpen)} className="ub" style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:9,padding:'5px 10px 5px 6px',cursor:'pointer',transition:'all 0.15s'}}>
                    {session.user.image ? <Image src={session.user.image} alt={session.user.name||''} width={26} height={26} style={{borderRadius:'50%',border:'1.5px solid rgba(74,159,212,0.3)'}}/> : <div style={{width:26,height:26,borderRadius:'50%',background:'linear-gradient(135deg,#4A9FD4,#2d5a8e)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'white'}}>{session.user.name?.[0]?.toUpperCase()}</div>}
                    <span style={{fontSize:13,fontWeight:500,color:'rgba(255,255,255,0.85)',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.user.name?.split(' ')[0]}</span>
                    <svg width="11" height="11" fill="none" stroke="rgba(255,255,255,0.35)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  {menuOpen&&(<>
                    <div style={{position:'fixed',inset:0,zIndex:10}} onClick={()=>setMenuOpen(false)}/>
                    <div style={{position:'absolute',right:0,top:'100%',marginTop:8,width:220,background:'#fff',borderRadius:14,boxShadow:'0 16px 48px rgba(0,0,0,0.18)',zIndex:20,overflow:'hidden'}}>
                      <div style={{padding:'14px 16px',borderBottom:'1px solid #f1f5f9'}}>
                        <p style={{fontSize:13,fontWeight:700,color:'#0f2540',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.user.name}</p>
                        <p style={{fontSize:12,color:'#94a3b8',margin:'2px 0 0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.user.email}</p>
                      </div>
                      <div style={{padding:'6px 0'}}>
                        {links.map(l=><Link key={l.href} href={l.href} onClick={()=>setMenuOpen(false)} className="mi" style={{display:'flex',alignItems:'center',gap:8,padding:'9px 16px',fontSize:13,color:'#374151',textDecoration:'none',transition:'background 0.1s'}}><span>{l.icon}</span>{l.label}</Link>)}
                      </div>
                      <div style={{borderTop:'1px solid #f1f5f9',padding:'6px 0'}}>
                        <button onClick={()=>{setMenuOpen(false);signOut({callbackUrl:'/login'});}} className="si" style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 16px',fontSize:13,color:'#dc2626',background:'transparent',border:'none',cursor:'pointer',transition:'background 0.1s'}}>
                          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>)}
                </div>
              ) : status==='unauthenticated' ? (
                <Link href="/login" style={{background:'linear-gradient(135deg,#4A9FD4,#3a8fc4)',color:'white',fontSize:13,fontWeight:600,padding:'6px 16px',borderRadius:8,textDecoration:'none',boxShadow:'0 2px 8px rgba(74,159,212,0.3)'}}>Sign in</Link>
              ) : <div style={{width:90,height:34,borderRadius:9,background:'rgba(255,255,255,0.05)'}}/>}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
