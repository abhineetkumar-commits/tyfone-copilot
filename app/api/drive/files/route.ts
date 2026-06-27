import { NextResponse } from 'next/server';
import { listDriveFiles } from '@/lib/drive';
import { DriveFile } from '@/types';

function inferCU(name: string): string {
  let n = name.replace(/\.(xlsx|csv|docx|pdf|txt|doc|xls|pptx|zip)$/i,'')
    .replace(/[-_]\d{4}[-_]\d{2}[-_]\d{2}([-_]\d{2}){0,3}/g,'')
    .replace(/[-_]?v\d+(\.\d+)?$/i,'').replace(/\s*\(\d+\)\s*$/,'')
    .replace(/[-_\s]?(go[-_\s]?live[-_\s]?)?playbook/gi,'').replace(/[-_\s]?pre[-_\s]?go[-_\s]?live/gi,'')
    .replace(/[-_\s]?checklist/gi,'').replace(/[-_\s]?onboarding/gi,'')
    .replace(/[-_\s]?nfinia[-_\s]?(retail|business)?/gi,'').replace(/[-_\s]?payfinia/gi,'')
    .replace(/[-_\s]?symitar/gi,'').replace(/[-_\s]?corelation/gi,'')
    .replace(/[-_]+/g,' ').trim();
  if (/^readme$/i.test(n)||/^template$/i.test(n)) return '_Reference';
  if (/^jira/i.test(n)||/^jira/i.test(name)) return '_System';
  if (n.length < 2) return '_Other';
  return n;
}

function fileType(mime: string, name: string): string {
  const n = name.toLowerCase();
  if (/tactiq/.test(n)) return 'Tactiq Notes';
  if (/\bmsa\b/.test(n)||/master.?service/.test(n)) return 'MSA';
  if (/checklist/.test(n)||/\bpgl\b/.test(n)) return 'Checklist';
  if (/playbook/.test(n)) return 'Playbook';
  if (/jira/.test(n)) return 'JIRA Export';
  if (mime.includes('spreadsheet')||/\.(xlsx|xls|csv)$/i.test(name)) return 'Spreadsheet';
  if (mime.includes('document')||/\.docx?$/i.test(name)) return 'Document';
  if (mime.includes('pdf')) return 'PDF';
  return 'File';
}

export async function GET() {
  try {
    const files = await listDriveFiles();
    const groups: Record<string, (DriveFile & { fileType: string })[]> = {};
    for (const f of files) {
      const cu = inferCU(f.name);
      if (!groups[cu]) groups[cu] = [];
      groups[cu].push({ ...f, fileType: fileType(f.mimeType, f.name) });
    }
    const sorted = Object.entries(groups)
      .sort(([a],[b]) => { const aS=a.startsWith('_'),bS=b.startsWith('_'); if(aS!==bS) return aS?1:-1; return a.localeCompare(b); })
      .map(([name,files]) => ({
        name: name.replace(/^_/,''),
        files: files.sort((a,b) => { const at=a.modifiedTime?new Date(a.modifiedTime).getTime():0,bt=b.modifiedTime?new Date(b.modifiedTime).getTime():0; return bt-at; }),
      }));
    return NextResponse.json({ groups: sorted, total: files.length });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
