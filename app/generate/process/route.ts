import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { generatePlaybook, generateChecklist, PlaybookMeta } from '@/lib/claude';
import { readAllDriveFiles } from '@/lib/drive';
import { extractText } from '@/lib/extractText';
import { updateJob } from '@/lib/jobs';
import { DriveFile } from '@/types';

interface FileField { field: string; name: string; content: string }

function base64ToFile(name: string, base64: string): File {
  const buf = Buffer.from(base64, 'base64');
  return new File([buf], name);
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;
  let jobId = 'unknown';

  try {
    const rawBody = await req.text();

    // Verify the request genuinely came from QStash (not a spoofed call).
    // Skipped automatically if signing keys aren't set, e.g. local dev.
    const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    if (signingKey && nextSigningKey) {
      const receiver = new Receiver({ currentSigningKey: signingKey, nextSigningKey });
      const signature = req.headers.get('upstash-signature') || '';
      const valid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
      if (!valid) {
        console.error('[process] QStash signature verification failed — rejecting request');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody) as Record<string, string>;
    jobId = payload.jobId || 'unknown';
    if (jobId === 'unknown') return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

    console.log(`[process:${jobId}] started @ ${elapsed()}`);
    await updateJob(jobId, { status: 'running', progress: 'Reading documents…' });

    const fileFields: FileField[] = JSON.parse(payload.__files || '[]');
    const filesByField: Record<string, File> = {};
    for (const f of fileFields) filesByField[f.field] = base64ToFile(f.name, f.content);

    const cuName = payload.creditUnionName;
    const outputType = payload.outputType as 'playbook'|'checklist'|'both';
    if (!cuName?.trim()) throw new Error('Credit Union name required');
    if (!outputType) throw new Error('Output type required');

    const meta: PlaybookMeta = {
      goLiveDate:    payload.goLiveDate || undefined,
      goLiveTime:    payload.goLiveTime || undefined,
      timezone:      payload.timezone || undefined,
      coreSystem:    payload.coreSystem || undefined,
      outgoingVendor:payload.outgoingVendor || undefined,
      integrations:  (() => { try { return JSON.parse(payload.integrations || '[]'); } catch { return []; } })(),
    };

    const msaFile = filesByField['msaFile'];
    let msaContent: string|undefined;
    if (msaFile && msaFile.size > 0) msaContent = await extractText(msaFile);
    console.log(`[process:${jobId}] MSA extracted (${msaContent?.length||0} chars) @ ${elapsed()}`);

    const addCount = parseInt(payload.additionalDocCount || '0', 10);
    const addTexts: string[] = [];
    for (let i = 0; i < addCount; i++) {
      const f = filesByField[`additionalDoc_${i}`];
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
      payload.customPrompt || '',
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
    try {
      await updateJob(jobId, { status: 'error', error: msg });
    } catch (updateErr) {
      console.error(`[process:${jobId}] also failed to write error status:`, updateErr);
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}