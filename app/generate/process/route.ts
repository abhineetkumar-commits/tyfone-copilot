import { NextRequest, NextResponse } from 'next/server';
import { generatePlaybook, generateChecklist, PlaybookMeta } from '@/lib/claude';
import { readAllDriveFiles } from '@/lib/drive';
import { extractText } from '@/lib/extractText';
import { updateJob } from '@/lib/jobs';
import { DriveFile } from '@/types';

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;

  const fd = await req.formData();
  const jobId = fd.get('jobId') as string;
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  console.log(`[process:${jobId}] started @ ${elapsed()}`);
  await updateJob(jobId, { status: 'running', progress: 'Reading documents…' });

  try {
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
    console.log(`[process:${jobId}] MSA extracted (${msaContent?.length||0} chars) @ ${elapsed()}`);

    const addCount = parseInt((fd.get('additionalDocCount') as string)||'0', 10);
    const addTexts: string[] = [];
    for (let i = 0; i < addCount; i++) {
      const f = fd.get(`additionalDoc_${i}`) as File|null;
      if (f && f.size > 0) addTexts.push(`=== ${f.name} ===\n${await extractText(f)}`);
    }
    console.log(`[process:${jobId}] ${addCount} additional docs extracted @ ${elapsed()}`);

    await updateJob(jobId, { progress: 'Checking reference library…' });
    let driveFiles: (DriveFile & {content?:string})[] = [];
    if (!msaContent) {
      try {
        driveFiles = await Promise.race([
          readAllDriveFiles(),
          new Promise<(DriveFile & {content?:string})[]>((_, reject) => setTimeout(() => reject(new Error('Drive timeout')), 15000)),
        ]);
      } catch(e){ console.warn(`[process:${jobId}] Drive unavailable or too slow:`, e); }
    }
    console.log(`[process:${jobId}] Drive files ready (${driveFiles.length}) @ ${elapsed()}`);

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

    await updateJob(jobId, { progress: wantPlaybook && wantChecklist ? 'Generating playbook and questionnaire…' : wantPlaybook ? 'Generating playbook…' : 'Generating questionnaire…' });
    console.log(`[process:${jobId}] starting AI calls (playbook=${wantPlaybook}, checklist=${wantChecklist}) @ ${elapsed()}`);

    const [playbookResult, checklistResult] = await Promise.all([
      wantPlaybook ? generatePlaybook(cuName, driveFiles, msaContent, enriched||undefined).then(r => { console.log(`[process:${jobId}] playbook done @ ${elapsed()}`); return r; }) : Promise.resolve(undefined),
      wantChecklist ? generateChecklist(cuName, driveFiles, msaContent, enriched||undefined).then(r => { console.log(`[process:${jobId}] checklist done @ ${elapsed()}`); return r; }) : Promise.resolve(undefined),
    ]);

    if (playbookResult) result.playbook = playbookResult;
    if (checklistResult) result.checklist = checklistResult;
    result.driveFileCount = driveFiles.length;
    result.hasMSA = !!msaContent;
    result.meta = meta;

    console.log(`[process:${jobId}] complete @ ${elapsed()}`);
    await updateJob(jobId, { status: 'complete', result: result as never, progress: 'Done' });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[process:${jobId}] error @ ${elapsed()}:`, e);
    await updateJob(jobId, { status: 'error', error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}