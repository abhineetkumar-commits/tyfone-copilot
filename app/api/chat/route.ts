import { NextRequest, NextResponse } from 'next/server';
import { readAllDriveFiles } from '@/lib/drive';
import { DriveFile } from '@/types';
import Anthropic from '@anthropic-ai/sdk';

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function score(f: DriveFile, q: string, cu?: string): number {
  const ql = q.toLowerCase(), nl = f.name.toLowerCase(); let s = 0;
  if (cu && cu.trim().length > 1) for (const w of cu.toLowerCase().split(/\s+/).filter((w:string)=>w.length>2)) if (nl.includes(w)) s += 30;
  for (const w of ql.split(/\s+/).filter(w=>w.length>3)) if (nl.includes(w)) s += 8;
  const boosts: [RegExp,RegExp,number][] = [[/msa|contract/i,/msa|master.?service/i,15],[/meeting|note|call|tactiq/i,/tactiq/i,15],[/playbook|go.?live/i,/playbook/i,15],[/checklist|pgl/i,/(checklist|pgl)/i,15],[/jira|ticket/i,/jira/i,15]];
  for (const [qp,fp,b] of boosts) if (qp.test(ql)&&fp.test(nl)) s+=b;
  if (f.modifiedTime) { const d=(Date.now()-new Date(f.modifiedTime).getTime())/86400000; if(d<7)s+=8;else if(d<30)s+=4; }
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, creditUnionName, msaContent } = await req.json();
    if (!messages?.length) return NextResponse.json({error:'Messages required'},{status:400});
    const hasMSA = !!(msaContent?.trim().length > 100);
    const ctx = messages.slice(-4).map((m:{content:string})=>m.content).join(' ');

    let driveFiles: (DriveFile & {content?:string})[] = [];
    try { driveFiles = await readAllDriveFiles() as typeof driveFiles; } catch(e){ console.warn('Drive unavailable:',e); }

    let usedFiles: typeof driveFiles = [];
    if (hasMSA && creditUnionName?.trim().length > 1) {
      const words = creditUnionName.toLowerCase().split(/\s+/).filter((w:string)=>w.length>2);
      usedFiles = driveFiles.filter(f=>words.some((w:string)=>f.name.toLowerCase().includes(w))).slice(0,3).filter(f=>f.content&&!f.content.startsWith('['));
    } else {
      usedFiles = driveFiles.map(f=>({...f,_score:score(f,ctx,creditUnionName)})).sort((a:DriveFile&{_score?:number},b:DriveFile&{_score?:number})=>(b._score||0)-(a._score||0)).filter((f,i)=>i<4||(((f as DriveFile&{_score?:number})._score||0)>5&&i<10)).filter(f=>f.content&&!f.content.startsWith('['));
    }

    const docParts: string[] = [];
    if (hasMSA) docParts.push(`## Uploaded Document\n${msaContent.substring(0,80000)}`);
    if (usedFiles.length) { docParts.push('## Relevant Drive Documents'); for (const f of usedFiles) docParts.push(`### ${f.name}\n${f.content!.substring(0,14000)}`); }

    const sys = `You are **Tyfone Copilot** — expert AI assistant for the Tyfone delivery team.

## Expertise
- **Credit union go-live**: nFinia platform, playbooks, MSA analysis, integration sign-offs, hypercare
- **Core banking**: Symitar/JHA, Corelation KeyStone, Fiserv DNA/Portico, FIS, Jack Henry
- **Integrations**: Velera, BioCatch, Verafin, Vertifi RDC, CheckFree, Zelle, Plaid, and 50+ others
- **Regulations**: NCUA, Reg E, Reg DD, BSA/AML, FFIEC, NACHA, PCI DSS
- **Fintech**: ACH, wire, bill pay, RDC, P2P payments, fraud detection
- **General**: Answer any question confidently from broad knowledge

## Response Style
- Direct, expert-level answers — no hedging
- **Bold** key terms, bullets for lists, headers for multi-part answers
- Cite document names when answering from docs
- Use code blocks for technical content
- For general questions: answer from knowledge, not just documents
${creditUnionName ? `\n## Context\nWorking with: **${creditUnionName}**` : ''}
${docParts.length ? `\n## Documents\n${docParts.join('\n\n').substring(0,95000)}` : ''}`;

    const r = await ai.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 3000, system: sys,
      messages: messages.map((m:{role:string;content:string})=>({role:m.role,content:m.content})),
    });

    return NextResponse.json({
      reply: r.content.filter(b=>b.type==='text').map(b=>b.text).join(''),
      driveFileCount: driveFiles.length,
      usedFiles: [...(hasMSA?[{name:'Uploaded document',fileType:'Document'}]:[]),...usedFiles.map(f=>({name:f.name,fileType:'File'}))],
    });
  } catch (e: unknown) {
    return NextResponse.json({error: e instanceof Error ? e.message : String(e)},{status:500});
  }
}
