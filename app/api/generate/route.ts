import { NextRequest, NextResponse } from 'next/server';
import { generatePlaybook, generateChecklist, generateRisks, buildPlaybookExcel, buildChecklistExcel, PlaybookMeta, RiskData } from '@/lib/claude';
import { readAllDriveFiles } from '@/lib/drive';
import { DriveFile } from '@/types';

async function extractText(file: File): Promise<string> {
  const buf = await file.arrayBuffer(); const bytes = new Uint8Array(buf);
  if (bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46) {
    const raw=new TextDecoder('latin1').decode(buf); const chunks: string[]=[];
    const btEt=/BT([\s\S]*?)ET/g, tj=/\(((?:[^()\\]|\\[\s\S])*)\)\s*T[jJ]/g;
    let m; while((m=btEt.exec(raw))!==null){let t;while((t=tj.exec(m[1]))!==null)chunks.push(t[1].replace(/\\n/g,'\n').replace(/\\\(/g,'(').replace(/\\\)/g,')'));}
    const out=chunks.join(' ').replace(/\s+/g,' ').trim();
    return (out.length>200?out:raw.replace(/[^\x20-\x7E\n]/g,' ')).substring(0,150000);
  }
  if (file.name.endsWith('.docx')) {
    const raw=new TextDecoder('utf-8',{fatal:false}).decode(buf);
    const t=(raw.match(/<w:t[^>]*>(.*?)<\/w:t>/g)||[]).map(m=>m.replace(/<[^>]+>/g,'')).join(' ');
    if (t.length>100) return t.substring(0,150000);
  }
  return new TextDecoder('utf-8',{fatal:false}).decode(buf).substring(0,150000);
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;
  // Internal soft-timeout: Vercel Hobby kills the function at 60s and returns
  // a non-JSON error page. We race against a slightly shorter limit so we can
  // return a clean JSON error to the client instead.
  const SOFT_TIMEOUT_MS = 50000;
  const softTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('SOFT_TIMEOUT')), SOFT_TIMEOUT_MS)
  );

  try {
    const work = (async () => {
      const fd = await req.formData();
      console.log(`[generate] formData parsed @ ${elapsed()}`);
      const cuName = fd.get('creditUnionName') as string;
      const outputType = fd.get('outputType') as 'playbook'|'checklist'|'both';
      if (!cuName?.trim()) throw new Error('Credit Union name required');
      if (!outputType) throw new Error('Output type required');

      const meta: PlaybookMeta = {
        goLiveDate:    (fd.get('goLiveDate')     as string)||undefined,
        goLiveTime:    (fd.get('goLiveTime')     as string)||undefined,
        timezone:      (fd.get('timezone')       as string)||undefined,
        coreSystem:    (fd.get('coreSystem')     as string)||undefined,
        outgoingVendor:(fd.get('outgoingVendor') as string)||undefined,
        integrations:  (() => { try { return JSON.parse(fd.get('integrations') as string||'[]'); } catch { return []; } })(),
      };

      const msaFile = fd.get('msaFile') as File|null;
      let msaContent: string|undefined;
      if (msaFile && msaFile.size > 0) msaContent = await extractText(msaFile);
      console.log(`[generate] MSA extracted (${msaContent?.length||0} chars) @ ${elapsed()}`);

      // Additional reference docs
      const addCount = parseInt((fd.get('additionalDocCount') as string)||'0', 10);
      const addTexts: string[] = [];
      for (let i = 0; i < addCount; i++) {
        const f = fd.get(`additionalDoc_${i}`) as File|null;
        if (f && f.size > 0) addTexts.push(`=== ${f.name} ===\n${await extractText(f)}`);
      }
      console.log(`[generate] ${addCount} additional docs extracted @ ${elapsed()}`);

      let driveFiles: (DriveFile & {content?:string})[] = [];
      // Only consult Drive when no MSA was uploaded — if the user provided an
      // MSA directly, it's the authoritative source and Drive lookup just adds
      // latency (and was a major contributor to serverless function timeouts).
      if (!msaContent) {
        try {
          driveFiles = await Promise.race([
            readAllDriveFiles(),
            new Promise<(DriveFile & {content?:string})[]>((_, reject) => setTimeout(() => reject(new Error('Drive timeout')), 15000)),
          ]);
        } catch(e){ console.warn('Drive unavailable or too slow:', e); }
      }
      console.log(`[generate] Drive files ready (${driveFiles.length}) @ ${elapsed()}`);

      const enriched = [
        meta.goLiveDate    ? `Go-Live Date: ${meta.goLiveDate}` : '',
        meta.goLiveTime    ? `Go-Live Time: ${meta.goLiveTime}` : '',
        meta.timezone      ? `Timezone: ${meta.timezone}` : '',
        meta.coreSystem    ? `Core System: ${meta.coreSystem}` : '',
        meta.outgoingVendor? `Outgoing Vendor: ${meta.outgoingVendor}` : '',
        meta.integrations?.length ? `Integrations: ${meta.integrations.join(', ')}` : '',
        (fd.get('customPrompt') as string)||'',
        addTexts.length ? `\nADDITIONAL DOCUMENTS:\n${addTexts.join('\n\n')}` : '',
      ].filter(Boolean).join('\n');

      const result: Record<string,unknown> = {};
      const wantPlaybook = outputType==='playbook'||outputType==='both';
      const wantChecklist = outputType==='checklist'||outputType==='both';
      console.log(`[generate] starting AI calls (playbook=${wantPlaybook}, checklist=${wantChecklist}) @ ${elapsed()}`);
      const [playbookResult, checklistResult] = await Promise.all([
        wantPlaybook ? generatePlaybook(cuName, driveFiles, msaContent, enriched||undefined).then(r => { console.log(`[generate] playbook done @ ${elapsed()}`); return r; }) : Promise.resolve(undefined),
        wantChecklist ? generateChecklist(cuName, driveFiles, msaContent, enriched||undefined).then(r => { console.log(`[generate] checklist done @ ${elapsed()}`); return r; }) : Promise.resolve(undefined),
      ]);
      if (playbookResult) result.playbook = playbookResult;
      if (checklistResult) result.checklist = checklistResult;
      result.driveFileCount = driveFiles.length;
      result.hasMSA = !!msaContent;
      result.meta = meta;
      console.log(`[generate] complete @ ${elapsed()}`);
      return result;
    })();

    const result = await Promise.race([work, softTimeout]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[generate] error @ ${elapsed()}:`, e);
    if (msg === 'SOFT_TIMEOUT') {
      return NextResponse.json({ error: 'Generation is taking longer than expected. Try generating Playbook or Checklist separately, or reduce additional documents.' }, { status: 504 });
    }
    return NextResponse.json({error: msg},{status:500});
  }
}

export async function PUT(req: NextRequest) {
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;
  try {
    const { type, data, prereqs } = await req.json();
    const meta: PlaybookMeta = prereqs || {};
    let buffer: Buffer;
    if (type === 'playbook') {
      let riskData: RiskData | undefined;
      try {
        riskData = await Promise.race([
          generateRisks(data.creditUnion, data, undefined),
          new Promise<RiskData>((_, reject) => setTimeout(() => reject(new Error('Risk generation timeout')), 25000)),
        ]);
        console.log(`[export] risks generated @ ${elapsed()}`);
      } catch (e) { console.warn(`[export] risk generation failed/timed out @ ${elapsed()}:`, e); }
      buffer = await buildPlaybookExcel(data, meta, riskData);
      console.log(`[export] playbook excel built @ ${elapsed()}`);
    } else if (type === 'checklist') {
      buffer = await buildChecklistExcel(data, meta);
      console.log(`[export] checklist excel built @ ${elapsed()}`);
    } else {
      return NextResponse.json({error:'Invalid type'},{status:400});
    }
    const filename = `${type==='playbook'?'GoLivePlaybook':'PreGoLive_Questionnaire'}_${data.creditUnion.replace(/\s+/g,'_')}.xlsx`;
    return new NextResponse(buffer as unknown as BodyInit, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"` } });
  } catch (e: unknown) {
    console.error(`[export] error @ ${elapsed()}:`, e);
    return NextResponse.json({error: e instanceof Error ? e.message : String(e)},{status:500});
  }
}