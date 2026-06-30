import { google } from 'googleapis';
import { DriveFile } from '@/types';
import * as XLSX from 'xlsx';

function getAuth() {
  let pk = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, '');
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!pk || !email) throw new Error('Google service account credentials not configured');
  return new google.auth.GoogleAuth({
    credentials: { type: 'service_account', private_key: pk, client_email: email },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

export async function listDriveFiles(folderId?: string): Promise<DriveFile[]> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const root = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!root) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');
  const all: DriveFile[] = [];
  async function collect(id: string) {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({ q: `'${id}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: 100, ...(pageToken ? { pageToken } : {}) });
      pageToken = res.data.nextPageToken || undefined;
      for (const f of res.data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') await collect(f.id!);
        else all.push({ id: f.id!, name: f.name!, mimeType: f.mimeType!, size: f.size || undefined, modifiedTime: f.modifiedTime || undefined });
      }
    } while (pageToken);
  }
  await collect(root);
  return all;
}

export async function readDriveFile(fileId: string, mimeType: string, fileName = ''): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const gExports: Record<string, string> = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
  };
  if (gExports[mimeType]) {
    const r = await drive.files.export({ fileId, mimeType: gExports[mimeType] });
    return (r.data as string).substring(0, 50000);
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    const r = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
    return (r.data as string).substring(0, 50000);
  }
  if (mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    try {
      const r = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
      const wb = XLSX.read(r.data as ArrayBuffer, { type: 'buffer' });
      const lines: string[] = [`[Excel: ${fileName}]`];
      for (const sn of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false });
        if (csv.trim()) { lines.push(`\n--- Sheet: ${sn} ---`); lines.push(csv.substring(0, 15000)); }
      }
      return lines.join('\n').substring(0, 50000);
    } catch (e) { return `[Excel parse error: ${e}]`; }
  }
  if (mimeType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
    try {
      const r = await drive.files.export({ fileId, mimeType: 'text/plain' });
      return (r.data as string).substring(0, 50000);
    } catch {
      try {
        const r = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
        return ((r.data as string).match(/<w:t[^>]*>(.*?)<\/w:t>/g) || []).map(m => m.replace(/<[^>]+>/g, '')).join(' ').substring(0, 50000);
      } catch { return `[DOCX: ${fileName}]`; }
    }
  }
  if (mimeType === 'application/pdf') {
    const r = await drive.files.get({ fileId, fields: 'name,description' });
    return `[PDF: ${r.data.name}${r.data.description ? ' — ' + r.data.description : ''}]`;
  }
  return `[${mimeType}: ${fileName}]`;
}

export async function readAllDriveFiles(folderId?: string, maxFiles = 6): Promise<(DriveFile & { content?: string })[]> {
  const files = await listDriveFiles(folderId);
  // Only download/parse content for the most recently modified files, capped.
  // Downloading every file in the Drive folder on every request is what was
  // causing generation requests to exceed the serverless function timeout.
  const candidates = [...files]
    .sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))
    .slice(0, maxFiles);
  const results = await Promise.allSettled(candidates.map(async f => {
    try { return { ...f, content: await readDriveFile(f.id, f.mimeType, f.name) }; }
    catch { return { ...f, content: `[Failed: ${f.name}]` }; }
  }));
  return results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<DriveFile & { content?: string }>).value);
}