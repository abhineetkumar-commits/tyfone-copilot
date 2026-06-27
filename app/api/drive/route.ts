import { NextRequest, NextResponse } from 'next/server';
import { listDriveFiles, readDriveFile } from '@/lib/drive';
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId'), mimeType = searchParams.get('mimeType'), folderId = searchParams.get('folderId') || undefined;
    if (fileId && mimeType) { const content = await readDriveFile(fileId, mimeType); return NextResponse.json({ content }); }
    const files = await listDriveFiles(folderId);
    return NextResponse.json({ files });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
