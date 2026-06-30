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
  try {
    const fd = await req.formData();
    const cuName = fd.get('creditUnionName') as string;
    const outputType = fd.get('outputType') as 'playbook'|'checklist'|'both';
    if (!cuName?.trim()) return NextResponse.json({error:'Credit Union name required'},{status:400});
    if (!outputType) return NextResponse.json({error:'Output type required'},{status:400});

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

    // Additional reference docs
    const addCount = parseInt((fd.get('additionalDocCount') as string)||'0', 10);
    const addTexts: string[] = [];
    for (let i = 0; i < addCount; i++) {
      const f = fd.get(`additionalDoc_${i}`) as File|null;
      if (f && f.size > 0) addTexts.push(`=== ${f.name} ===\n${await extractText(f)}`);
    }

    let driveFiles: (DriveFile & {content?:string})[] = [];
    try { driveFiles = await readAllDriveFiles(); } catch(e){ console.warn('Drive unavailable:', e); }

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
    const [playbookResult, checklistResult] = await Promise.all([
      wantPlaybook ? generatePlaybook(cuName, driveFiles, msaContent, enriched||undefined) : Promise.resolve(undefined),
      wantChecklist ? generateChecklist(cuName, driveFiles, msaContent, enriched||undefined) : Promise.resolve(undefined),
    ]);
    if (playbookResult) result.playbook = playbookResult;
    if (checklistResult) result.checklist = checklistResult;
    result.driveFileCount = driveFiles.length;
    result.hasMSA = !!msaContent;
    result.meta = meta;
    return NextResponse.json(result);
  } catch (e: unknown) {
    console.error('Generate error:', e);
    return NextResponse.json({error: e instanceof Error ? e.message : String(e)},{status:500});
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { type, data, prereqs } = await req.json();
    const meta: PlaybookMeta = prereqs || {};
    let buffer: Buffer;
    if (type === 'playbook') {
      let riskData: RiskData | undefined;
      try { riskData = await generateRisks(data.creditUnion, data, undefined); } catch (e) { console.warn('Risk generation failed:', e); }
      buffer = await buildPlaybookExcel(data, meta, riskData);
    } else if (type === 'checklist') {
      buffer = await buildChecklistExcel(data, meta);
    } else {
      return NextResponse.json({error:'Invalid type'},{status:400});
    }
    const filename = `${type==='playbook'?'GoLivePlaybook':'PreGoLive_Questionnaire'}_${data.creditUnion.replace(/\s+/g,'_')}.xlsx`;
    return new NextResponse(buffer as unknown as BodyInit, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"` } });
  } catch (e: unknown) { return NextResponse.json({error: e instanceof Error ? e.message : String(e)},{status:500}); }
}