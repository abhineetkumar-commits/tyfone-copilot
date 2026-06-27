'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Attachment { name: string; content: string; type: string; }
interface Message {
  id: string; role: 'user' | 'assistant'; content: string;
  timestamp: Date; sources?: { name: string; fileType: string }[];
  attachments?: Attachment[]; isError?: boolean;
}
interface Session {
  id: string; title: string; messages: Message[];
  cuName: string; updatedAt: Date;
}
interface DriveGroup { name: string; files: { name: string; fileType: string }[]; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 10); }

function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let h = text.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_m: string, _lang: string, code: string) => {
    const safe = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    codeBlocks.push('<pre style="background:#0f172a;color:#e2e8f0;border-radius:10px;padding:14px 16px;overflow-x:auto;font-size:12.5px;line-height:1.7;margin:10px 0"><code style="font-family:ui-monospace,monospace">' + safe + '</code></pre>');
    return '%%CB' + (codeBlocks.length - 1) + '%%';
  });

  // escape
  h = h.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // tables  |col|col|
  h = h.replace(/(\|.+\|\n?)+/g, (tbl: string) => {
    const rows = tbl.trim().split('\n').filter((r: string) => r.trim());
    let out = '<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:13px">';
    let hdr = true;
    for (const row of rows) {
      if (/^\|[-:\s|]+\|$/.test(row.trim())) { hdr = false; continue; }
      const cells = row.split('|').filter((_: string, i: number, a: string[]) => i > 0 && i < a.length - 1);
      if (hdr) {
        out += '<tr>' + cells.map((c: string) => '<th style="background:#0f2540;color:#fff;padding:9px 14px;text-align:left;font-weight:600;font-size:12px;letter-spacing:0.02em">' + c.trim() + '</th>').join('') + '</tr>';
        hdr = false;
      } else {
        out += '<tr>' + cells.map((c: string) => '<td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px">' + c.trim() + '</td>').join('') + '</tr>';
      }
    }
    return out + '</table></div>';
  });

  // inline code
  h = h.replace(/`([^`\n]+)`/g, '<code style="background:#f1f5f9;padding:2px 7px;border-radius:5px;font-size:12.5px;color:#1d4ed8;font-family:ui-monospace,monospace">$1</code>');

  // bold / italic
  h = h.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong style="color:#0f2540">$1</strong>');
  h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // headers
  h = h.replace(/^#### (.+)$/gm, '<div style="font-weight:700;font-size:11px;color:#64748b;margin:12px 0 4px;text-transform:uppercase;letter-spacing:0.06em">$1</div>');
  h = h.replace(/^### (.+)$/gm, '<div style="font-weight:700;font-size:14px;color:#0f2540;margin:14px 0 5px;padding-left:10px;border-left:3px solid #4A9FD4">$1</div>');
  h = h.replace(/^## (.+)$/gm, '<div style="font-weight:800;font-size:16px;color:#0f2540;margin:18px 0 8px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">$1</div>');
  h = h.replace(/^# (.+)$/gm, '<div style="font-weight:800;font-size:19px;color:#0f2540;margin:20px 0 10px;letter-spacing:-0.02em">$1</div>');

  // blockquote
  h = h.replace(/^&gt; (.+)$/gm, '<div style="border-left:3px solid #4A9FD4;padding:8px 14px;background:#f0f9ff;border-radius:0 8px 8px 0;margin:8px 0;color:#1e40af;font-size:13px">$1</div>');

  // bullet lists — group consecutive lines
  h = h.replace(/((?:^[•\-\*] .+\n?)+)/gm, (block: string) => {
    const items = block.trim().split('\n').map((l: string) => l.replace(/^[•\-\*]\s+/, '').trim()).filter(Boolean);
    return '<ul style="margin:6px 0;padding:0;list-style:none">' +
      items.map((i: string) => '<li style="display:flex;gap:8px;margin:4px 0;align-items:flex-start"><span style="color:#4A9FD4;flex-shrink:0;line-height:1.6;font-size:15px">•</span><span style="flex:1">' + i + '</span></li>').join('') +
      '</ul>';
  });

  // numbered lists
  h = h.replace(/((?:^\d+\. .+\n?)+)/gm, (block: string) => {
    const items = block.trim().split('\n').map((l: string) => l.replace(/^\d+\.\s+/, '').trim()).filter(Boolean);
    return '<ol style="margin:6px 0;padding:0;list-style:none">' +
      items.map((item: string, idx: number) => '<li style="display:flex;gap:8px;margin:4px 0"><span style="color:#4A9FD4;font-weight:700;flex-shrink:0;min-width:22px;font-size:13px">' + (idx + 1) + '.</span><span>' + item + '</span></li>').join('') +
      '</ol>';
  });

  // hr
  h = h.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>');

  // links
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;text-underline-offset:2px;font-weight:500">$1</a>');

  // paragraphs
  h = h.replace(/\n\n+/g, '</p><p style="margin:10px 0 0">');
  h = h.replace(/\n/g, '<br/>');
  h = '<p style="margin:0">' + h + '</p>';

  // restore code blocks
  codeBlocks.forEach((block: string, idx: number) => {
    h = h.split('%%CB' + idx + '%%').join(block);
  });

  return h;
}

const FILE_ICONS: Record<string,string> = {
  'Playbook':'⚡','Checklist':'✓','MSA':'📋','Tactiq Notes':'🎙',
  'JIRA Export':'🔖','Spreadsheet':'📊','Document':'📄','PDF':'📑','File':'📁',
};

const CAPS = [
  { icon:'📋', label:'Analyse MSAs', desc:'Go-live dates, SLAs, integrations' },
  { icon:'⚡', label:'Build Playbooks', desc:'Phases, tasks, timelines, owners' },
  { icon:'🏦', label:'Banking Expert', desc:'NCUA, Reg E, ACH, fraud, fintech' },
  { icon:'🔗', label:'Integration Q&A', desc:'Velera, BioCatch, Zelle, and more' },
];

const STARTERS = [
  'What are the key phases in a nFinia go-live?',
  'Explain the difference between Symitar and Corelation',
  'What is Reg E and how does it protect members?',
  'How does ACH debit origination work for credit unions?',
  'What NCUA requirements apply to digital banking?',
  'Best practices for Bill Pay migration cutover',
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [cuName, setCuName] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [driveGroups, setDriveGroups] = useState<DriveGroup[]>([]);
  const [driveTotal, setDriveTotal] = useState(0);
  const [driveLoading, setDriveLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState('');
  const [showCuInput, setShowCuInput] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const loadDrive = useCallback(async () => {
    setDriveLoading(true);
    try {
      const res = await fetch('/api/drive/files');
      if (res.ok) {
        const d = await res.json();
        setDriveGroups(d.groups || []);
        setDriveTotal(d.total || 0);
        const first = (d.groups || []).find((g: DriveGroup) => !['System','Reference','Other'].includes(g.name));
        if (first) setExpandedGroups(new Set([first.name]));
      }
    } catch {}
    setDriveLoading(false);
  }, []);

  useEffect(() => { loadDrive(); }, [loadDrive]);

  // ── Session management ────────────────────────────────────────────────────
  function saveSession() {
    if (!activeId) return;
    setSessions(p => p.map(s => s.id === activeId ? { ...s, messages, cuName, updatedAt: new Date() } : s));
  }

  function newChat() {
    saveSession();
    const id = genId();
    setSessions(p => [{ id, title: 'New chat', messages: [], cuName: '', updatedAt: new Date() }, ...p]);
    setActiveId(id); setMessages([]); setCuName(''); setAttachments([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function openSession(id: string) {
    saveSession();
    const s = sessions.find(s => s.id === id);
    if (s) { setActiveId(id); setMessages(s.messages); setCuName(s.cuName); setAttachments([]); }
  }

  function removeSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSessions(p => p.filter(s => s.id !== id));
    if (activeId === id) { setActiveId(''); setMessages([]); }
  }

  // ── File handling ─────────────────────────────────────────────────────────
  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        setAttachments(p => [...p, { name: file.name, content: text.substring(0, 100000), type: file.type || 'text/plain' }]);
      } catch { console.warn('Could not read file', file.name); }
    }
  }

  function removeAttachment(idx: number) {
    setAttachments(p => p.filter((_, i) => i !== idx));
  }

  // ── Copy message ──────────────────────────────────────────────────────────
  function copyMessage(id: string, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async function send(overrideText?: string) {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    let cid = activeId;
    if (!cid) {
      cid = genId();
      setSessions(p => [{ id: cid, title: text.slice(0, 50), messages: [], cuName, updatedAt: new Date() }, ...p]);
      setActiveId(cid);
    }

    const userMsg: Message = {
      id: genId(), role: 'user', content: text,
      timestamp: new Date(), attachments: attachments.length ? [...attachments] : undefined,
    };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setAttachments([]);
    setLoading(true);

    // Reset textarea height
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }

    try {
      // Combine all attachment content as MSA context
      const msaContent = attachments.map(a => `=== ${a.name} ===\n${a.content}`).join('\n\n') || undefined;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
          creditUnionName: cuName || undefined,
          msaContent,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      const asstMsg: Message = {
        id: genId(), role: 'assistant', content: data.reply,
        timestamp: new Date(), sources: data.usedFiles || [],
      };
      const final = [...newMsgs, asstMsg];
      setMessages(final);
      setSessions(p => p.map(s => s.id === cid ? {
        ...s, messages: final, cuName,
        title: s.title === 'New chat' ? text.slice(0, 50) : s.title,
        updatedAt: new Date(),
      } : s));
    } catch (e) {
      setMessages(p => [...p, {
        id: genId(), role: 'assistant', isError: true,
        content: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: new Date(),
      }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  // ── Regenerate last ───────────────────────────────────────────────────────
  async function regenerate() {
    if (loading || messages.length < 2) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    setMessages(p => p.filter(m => m.id !== messages[messages.length-1].id));
    await send(lastUser.content);
  }

  const userName = session?.user?.name?.split(' ')[0] || 'You';
  const userAvatar = session?.user?.image;

  return (
    <>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        .sess-item:hover{background:#f8fafc!important}
        .sess-item.active{background:#eff6ff!important;border-left:2px solid #4A9FD4!important}
        .grp-btn:hover{background:#f8fafc!important}
        .file-item:hover{background:#f1f5f9!important}
        .act-btn{opacity:0;transition:opacity 0.15s}
        .msg-wrap:hover .act-btn{opacity:1}
        .sug-chip:hover{background:#f0f9ff!important;border-color:#4A9FD4!important;color:#0f2540!important}
        .send-btn:hover:not(:disabled){background:#1a3358!important;transform:scale(1.05)}
        .attach-btn:hover{background:#f1f5f9!important}
        .input-wrap:focus-within{border-color:#4A9FD4!important;box-shadow:0 0 0 3px rgba(74,159,212,0.1)!important}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:99px}
        ::-webkit-scrollbar-thumb:hover{background:#cbd5e1}
        textarea{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      `}</style>

      <div style={{ display:'flex', height:'calc(100vh - 56px)', background:'#f9fafb', overflow:'hidden' }}>

        {/* ════ SIDEBAR ════ */}
        <div style={{
          width: sidebarOpen ? 260 : 0, flexShrink:0, overflow:'hidden',
          borderRight:'1px solid #e5e7eb', background:'#fff',
          display:'flex', flexDirection:'column',
          transition:'width 0.2s ease',
        }}>
          <div style={{ width:260, display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

            {/* New chat button */}
            <div style={{ padding:'14px 12px 10px', flexShrink:0 }}>
              <button onClick={newChat} style={{
                width:'100%', display:'flex', alignItems:'center', gap:8,
                padding:'9px 14px', background:'linear-gradient(135deg,#0f2540,#1E3A5F)',
                border:'none', borderRadius:10, cursor:'pointer', color:'#fff',
                fontSize:13, fontWeight:600, transition:'all 0.15s',
                boxShadow:'0 2px 8px rgba(15,37,64,0.2)',
              }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
                </svg>
                New Chat
              </button>
            </div>

            {/* Conversation list */}
            <div style={{ flex:1, overflowY:'auto', padding:'2px 0' }}>
              {sessions.length === 0 ? (
                <div style={{ padding:'24px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>💬</div>
                  <div style={{ fontSize:12, color:'#9ca3af', lineHeight:1.5 }}>Your conversations<br/>will appear here</div>
                </div>
              ) : sessions.map(s => (
                <div key={s.id} onClick={() => openSession(s.id)}
                  className={`sess-item${s.id===activeId?' active':''}`}
                  style={{
                    padding:'9px 14px', cursor:'pointer', position:'relative',
                    borderLeft:'2px solid transparent', transition:'all 0.1s',
                    borderBottom:'1px solid #f9fafb',
                  }}>
                  <div style={{ fontSize:12.5, fontWeight:500, color: s.id===activeId?'#0f2540':'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:22, lineHeight:1.4 }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:2 }}>
                    {s.messages.length} msg{s.messages.length!==1?'s':''} · {s.updatedAt.toLocaleDateString([],{month:'short',day:'numeric'})}
                  </div>
                  <button onClick={e => removeSession(s.id, e)}
                    style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#d1d5db', fontSize:13, padding:'2px 4px', borderRadius:4, transition:'color 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color='#ef4444'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color='#d1d5db'}>
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Drive files panel */}
            <div style={{ borderTop:'1px solid #f1f5f9', flexShrink:0, maxHeight:260, display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'8px 12px 6px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f9fafb' }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <svg width="11" height="11" fill="none" stroke="#4A9FD4" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                  </svg>
                  <span style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>Drive</span>
                  {driveTotal > 0 && <span style={{ fontSize:10, color:'#9ca3af', background:'#f1f5f9', padding:'1px 6px', borderRadius:10, fontWeight:600 }}>{driveTotal}</span>}
                </div>
                <button onClick={loadDrive} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:2, display:'flex' }}>
                  <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={driveLoading?{animation:'spin 1s linear infinite'}:{}}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                </button>
              </div>
              <div style={{ overflowY:'auto', flex:1 }}>
                {driveGroups.length === 0 && !driveLoading && (
                  <div style={{ padding:'12px 14px', fontSize:11, color:'#9ca3af', textAlign:'center' }}>No Drive files</div>
                )}
                {driveGroups.map(group => {
                  const exp = expandedGroups.has(group.name);
                  return (
                    <div key={group.name}>
                      <button onClick={() => setExpandedGroups(p => { const n=new Set(p); n.has(group.name)?n.delete(group.name):n.add(group.name); return n; })}
                        className="grp-btn"
                        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 12px', border:'none', background:'transparent', cursor:'pointer', borderBottom:'1px solid #f9fafb', transition:'background 0.1s' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden' }}>
                          <span style={{ fontSize:9 }}>🏦</span>
                          <span style={{ fontSize:11, fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{group.name}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                          <span style={{ fontSize:9, color:'#9ca3af', background:'#f1f5f9', padding:'1px 5px', borderRadius:8, fontWeight:600 }}>{group.files.length}</span>
                          <svg width="8" height="8" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" style={{ transform:exp?'rotate(180deg)':'none', transition:'transform 0.2s' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                          </svg>
                        </div>
                      </button>
                      {exp && group.files.map((f, fi) => (
                        <div key={fi} className="file-item"
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 12px 4px 20px', borderBottom:'1px solid #f9fafb', transition:'background 0.1s' }}>
                          <span style={{ fontSize:10, flexShrink:0 }}>{FILE_ICONS[f.fileType]||'📁'}</span>
                          <span style={{ fontSize:10, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {f.name.replace(/\.(xlsx|csv|docx|pdf|txt|doc)$/i,'')}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CU filter */}
            <div style={{ padding:'8px 12px', borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
              {showCuInput ? (
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="text" value={cuName} onChange={e => setCuName(e.target.value)}
                    placeholder="CU name to filter…" autoFocus
                    style={{ flex:1, padding:'5px 8px', fontSize:11, border:'1.5px solid #4A9FD4', borderRadius:6, outline:'none', color:'#1e293b' }}
                    onBlur={() => { if (!cuName) setShowCuInput(false); }}
                    onKeyDown={e => e.key==='Escape'&&setShowCuInput(false)}
                  />
                  {cuName && <button onClick={() => { setCuName(''); setShowCuInput(false); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:13 }}>✕</button>}
                </div>
              ) : (
                <button onClick={() => setShowCuInput(true)}
                  style={{ width:'100%', textAlign:'left', background:'none', border:'1px dashed #e5e7eb', borderRadius:6, padding:'5px 8px', cursor:'pointer', fontSize:11, color: cuName ? '#0f2540' : '#9ca3af', fontWeight: cuName ? 600 : 400 }}>
                  {cuName ? `🏦 ${cuName}` : '+ Filter by CU name'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ════ MAIN ════ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

          {/* Top bar */}
          <div style={{
            padding:'0 16px', height:52, borderBottom:'1px solid #e5e7eb',
            background:'#fff', display:'flex', alignItems:'center', gap:10, flexShrink:0,
          }}>
            {/* Toggle sidebar */}
            <button onClick={() => setSidebarOpen(p => !p)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', padding:'6px', borderRadius:8, display:'flex', transition:'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background='#f3f4f6'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background='transparent'}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>

            <div style={{ flex:1, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:28, height:28, background:'linear-gradient(135deg,#0f2540,#1E3A5F)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M8 4v8" stroke="#4A9FD4" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="8" cy="12" r="1.5" fill="#4A9FD4"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#0f2540', lineHeight:1.2 }}>
                  {cuName ? `Tyfone Copilot · ${cuName}` : 'Tyfone Copilot'}
                </div>
                <div style={{ fontSize:10.5, color:'#9ca3af' }}>
                  Credit union & fintech expert · {driveTotal} Drive files
                </div>
              </div>
            </div>

            {/* Capabilities badge */}
            <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', background:'rgba(74,159,212,0.08)', border:'1px solid rgba(74,159,212,0.2)', borderRadius:20 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block' }}/>
              <span style={{ fontSize:11, color:'#1e3a5f', fontWeight:600 }}>AI + Knowledge Base</span>
            </div>
          </div>

          {/* Messages area */}
          <div style={{ flex:1, overflowY:'auto', padding:'24px 0' }} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <div style={{ maxWidth:760, margin:'0 auto', padding:'0 20px', display:'flex', flexDirection:'column', gap:8 }}>

              {/* Empty state */}
              {messages.length === 0 && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:24, paddingTop:20, animation:'fadeIn 0.4s ease' }}>
                  {/* Logo */}
                  <div>
                    <div style={{ width:64, height:64, background:'linear-gradient(135deg,#0f2540,#1E3A5F)', borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', boxShadow:'0 8px 24px rgba(15,37,64,0.25)' }}>
                      <svg width="30" height="30" viewBox="0 0 16 16" fill="none">
                        <path d="M3 4h10M8 4v8" stroke="#4A9FD4" strokeWidth="2.2" strokeLinecap="round"/>
                        <circle cx="8" cy="12" r="1.8" fill="#4A9FD4"/>
                      </svg>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:22, fontWeight:800, color:'#0f2540', letterSpacing:'-0.03em', marginBottom:4 }}>Tyfone Copilot</div>
                      <div style={{ fontSize:14, color:'#6b7280' }}>Expert AI for credit union digital banking & go-live</div>
                    </div>
                  </div>

                  {/* Capability cards */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:'100%', maxWidth:540 }}>
                    {CAPS.map((c,i) => (
                      <div key={i} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                        <div style={{ fontSize:20, marginBottom:6 }}>{c.icon}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0f2540', marginBottom:2 }}>{c.label}</div>
                        <div style={{ fontSize:11.5, color:'#6b7280' }}>{c.desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* Starter questions */}
                  <div style={{ width:'100%', maxWidth:600 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, textAlign:'center' }}>Try asking</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
                      {STARTERS.map((q,i) => (
                        <button key={i} onClick={() => { setInput(q); inputRef.current?.focus(); }} className="sug-chip"
                          style={{ fontSize:12.5, color:'#374151', background:'#fff', border:'1px solid #e5e7eb', borderRadius:20, padding:'7px 14px', cursor:'pointer', transition:'all 0.15s' }}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, mi) => (
                <div key={msg.id} className="msg-wrap"
                  style={{ display:'flex', flexDirection:'column', alignItems: msg.role==='user'?'flex-end':'flex-start', animation:'msgIn 0.2s ease', gap:2 }}>

                  {/* Message bubble */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10, maxWidth:'88%', flexDirection: msg.role==='user'?'row-reverse':'row' }}>
                    {/* Avatar */}
                    {msg.role==='assistant' ? (
                      <div style={{ width:32, height:32, background:'linear-gradient(135deg,#0f2540,#1E3A5F)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1, boxShadow:'0 2px 8px rgba(15,37,64,0.18)' }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M3 4h10M8 4v8" stroke="#4A9FD4" strokeWidth="2" strokeLinecap="round"/>
                          <circle cx="8" cy="12" r="1.5" fill="#4A9FD4"/>
                        </svg>
                      </div>
                    ) : (
                      <div style={{ width:32, height:32, borderRadius:10, overflow:'hidden', flexShrink:0, marginTop:1, boxShadow:'0 2px 6px rgba(0,0,0,0.1)' }}>
                        {userAvatar ? (
                          <img src={userAvatar} alt={userName} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                        ) : (
                          <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#4A9FD4,#2d5a8e)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff' }}>
                            {userName[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bubble */}
                    <div style={{ maxWidth:'100%' }}>
                      {/* Attachments shown above user message */}
                      {msg.attachments?.length && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:6, justifyContent:'flex-end' }}>
                          {msg.attachments.map((a,ai) => (
                            <div key={ai} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(74,159,212,0.1)', border:'1px solid rgba(74,159,212,0.25)', borderRadius:8, padding:'4px 10px', fontSize:11, color:'#1e3a5f', fontWeight:500 }}>
                              📎 {a.name}
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{
                        padding:'12px 16px', fontSize:14, lineHeight:1.75,
                        borderRadius: msg.role==='user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                        background: msg.role==='user'
                          ? 'linear-gradient(135deg,#0f2540,#1E3A5F)'
                          : msg.isError ? '#fef2f2' : '#fff',
                        color: msg.role==='user' ? '#fff' : msg.isError ? '#b91c1c' : '#1e293b',
                        border: msg.role==='assistant' ? `1px solid ${msg.isError?'#fecaca':'#e5e7eb'}` : 'none',
                        boxShadow: msg.role==='user'
                          ? '0 2px 10px rgba(15,37,64,0.2)'
                          : '0 1px 4px rgba(0,0,0,0.05)',
                      }}>
                        {msg.role==='assistant' ? (
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} style={{ lineHeight:1.75 }}/>
                        ) : (
                          <div style={{ whiteSpace:'pre-wrap' }}>{msg.content}</div>
                        )}
                      </div>

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                          {msg.sources.map((s,si) => (
                            <span key={si} style={{ fontSize:10.5, color:'#6b7280', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:20, padding:'2px 9px', display:'inline-flex', alignItems:'center', gap:3 }}>
                              {FILE_ICONS[s.fileType]||'📎'} {s.name.replace(/\.(xlsx|csv|docx|pdf|txt|doc)$/i,'').slice(0,32)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Message actions */}
                  <div style={{ display:'flex', gap:4, paddingLeft: msg.role==='user' ? 0 : 42, paddingRight: msg.role==='user' ? 42 : 0, justifyContent: msg.role==='user' ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontSize:10, color:'#9ca3af', padding:'0 4px' }}>
                      {msg.timestamp.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                    </span>
                    {msg.role==='assistant' && (
                      <>
                        <button className="act-btn" onClick={() => copyMessage(msg.id, msg.content)}
                          style={{ background:'none', border:'1px solid #e5e7eb', borderRadius:6, padding:'2px 8px', cursor:'pointer', fontSize:10.5, color: copiedId===msg.id?'#16a34a':'#6b7280', display:'flex', alignItems:'center', gap:4 }}>
                          {copiedId===msg.id ? '✓ Copied' : '⎘ Copy'}
                        </button>
                        {mi === messages.length - 1 && (
                          <button className="act-btn" onClick={regenerate}
                            style={{ background:'none', border:'1px solid #e5e7eb', borderRadius:6, padding:'2px 8px', cursor:'pointer', fontSize:10.5, color:'#6b7280', display:'flex', alignItems:'center', gap:4 }}>
                            ↺ Retry
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <div style={{ display:'flex', alignItems:'flex-start', gap:10, animation:'msgIn 0.2s ease' }}>
                  <div style={{ width:32, height:32, background:'linear-gradient(135deg,#0f2540,#1E3A5F)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 2px 8px rgba(15,37,64,0.18)' }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M3 4h10M8 4v8" stroke="#4A9FD4" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="8" cy="12" r="1.5" fill="#4A9FD4"/>
                    </svg>
                  </div>
                  <div style={{ padding:'14px 18px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'4px 18px 18px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                      {[0,160,320].map(d => (
                        <div key={d} style={{ width:7, height:7, background:'#cbd5e1', borderRadius:'50%', animation:'bounce 1.3s ease infinite', animationDelay:`${d}ms` }}/>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef}/>
            </div>
          </div>

          {/* ── INPUT AREA ── */}
          <div style={{ borderTop:'1px solid #e5e7eb', background:'#fff', padding:'12px 16px 14px', flexShrink:0 }}>
            <div style={{ maxWidth:760, margin:'0 auto' }}>

              {/* Attachment preview */}
              {attachments.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8, padding:'8px 10px', background:'#f9fafb', borderRadius:10, border:'1px solid #e5e7eb' }}>
                  {attachments.map((a, ai) => (
                    <div key={ai} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'4px 10px', fontSize:12, color:'#374151' }}>
                      <span>📎</span>
                      <span style={{ fontWeight:500 }}>{a.name}</span>
                      <span style={{ color:'#9ca3af', fontSize:10.5 }}>({Math.round(a.content.length/1000)}k chars)</span>
                      <button onClick={() => removeAttachment(ai)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:13, padding:0, lineHeight:1 }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color='#ef4444'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color='#9ca3af'}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input box */}
              <div className="input-wrap" style={{
                display:'flex', alignItems:'flex-end', gap:8,
                background:'#fff', border:'1.5px solid #e5e7eb', borderRadius:16,
                padding:'10px 12px 10px 14px',
                boxShadow:'0 2px 12px rgba(0,0,0,0.06)',
                transition:'all 0.15s',
              }}>
                {/* Attach file button */}
                <button className="attach-btn" onClick={() => fileRef.current?.click()} title="Attach file"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', padding:'4px', borderRadius:8, display:'flex', alignItems:'center', flexShrink:0, transition:'background 0.15s', marginBottom:2 }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                  </svg>
                </button>
                <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.xlsx,.csv,.doc" style={{ display:'none' }}
                  onChange={e => handleFiles(e.target.files)}/>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                  }}
                  onKeyDown={handleKey}
                  placeholder="Message Tyfone Copilot… (attach files, ask anything)"
                  rows={1}
                  disabled={loading}
                  style={{
                    flex:1, fontSize:14, color:'#1e293b', lineHeight:1.65,
                    maxHeight:180, overflowY:'auto', resize:'none',
                    outline:'none', border:'none', background:'transparent',
                    fontFamily:'inherit',
                  }}
                />

                {/* Send */}
                <button onClick={() => send()} disabled={loading || (!input.trim() && attachments.length === 0)}
                  className="send-btn"
                  style={{
                    width:38, height:38, flexShrink:0,
                    background: loading || (!input.trim() && !attachments.length)
                      ? '#e5e7eb'
                      : 'linear-gradient(135deg,#0f2540,#1E3A5F)',
                    border:'none', borderRadius:11, cursor: loading || (!input.trim() && !attachments.length) ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'all 0.15s',
                    boxShadow: input.trim() || attachments.length ? '0 2px 8px rgba(15,37,64,0.25)' : 'none',
                  }}>
                  {loading ? (
                    <div style={{ width:14, height:14, border:'2.5px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                  ) : (
                    <svg width="15" height="15" fill="none" stroke="white" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                  )}
                </button>
              </div>

              {/* Footer hint */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:7, padding:'0 2px' }}>
                <span style={{ fontSize:11, color:'#9ca3af' }}>
                  Enter to send · Shift+Enter for newline · Drop files to attach
                </span>
                <span style={{ fontSize:11, color:'#9ca3af' }}>
                  Powered by Claude Sonnet
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
