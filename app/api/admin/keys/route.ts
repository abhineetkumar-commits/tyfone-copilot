import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { isUserAdmin } from '@/lib/users';
function mask(v?: string, n = 4) { if (!v) return 'Not configured'; return v.length <= n ? '••••' : `••••${v.slice(-n)}`; }
async function requireAdmin() {
  const session = await getServerSession();
  if (!session?.user?.email) return false;
  return isUserAdmin(session.user.email);
}
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
  const keys = [
    { id: 'anthropic', name: 'ANTHROPIC_API_KEY', service: 'anthropic', keyPreview: process.env.ANTHROPIC_API_KEY ? `sk-ant-...${mask(process.env.ANTHROPIC_API_KEY)}` : 'Not configured', status: process.env.ANTHROPIC_API_KEY ? 'active' : 'inactive', createdAt: 'env' },
    { id: 'sa_email', name: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', service: 'google_drive', keyPreview: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'Not configured', status: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'active' : 'inactive', createdAt: 'env' },
    { id: 'private_key', name: 'GOOGLE_PRIVATE_KEY', service: 'google_drive', keyPreview: process.env.GOOGLE_PRIVATE_KEY ? '-----BEGIN PRIVATE KEY----- [set]' : 'Not configured', status: process.env.GOOGLE_PRIVATE_KEY ? 'active' : 'inactive', createdAt: 'env' },
    { id: 'folder_id', name: 'GOOGLE_DRIVE_FOLDER_ID', service: 'google_drive', keyPreview: process.env.GOOGLE_DRIVE_FOLDER_ID || 'Not configured', status: process.env.GOOGLE_DRIVE_FOLDER_ID ? 'active' : 'inactive', createdAt: 'env' },
    { id: 'client_id', name: 'GOOGLE_CLIENT_ID', service: 'google_drive', keyPreview: process.env.GOOGLE_CLIENT_ID ? `...${mask(process.env.GOOGLE_CLIENT_ID, 12)}` : 'Not configured', status: process.env.GOOGLE_CLIENT_ID ? 'active' : 'inactive', createdAt: 'env' },
    { id: 'nextauth_sec', name: 'NEXTAUTH_SECRET', service: 'other', keyPreview: process.env.NEXTAUTH_SECRET ? '[configured]' : 'Not configured', status: process.env.NEXTAUTH_SECRET ? 'active' : 'inactive', createdAt: 'env' },
  ];
  return NextResponse.json({ keys });
}
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
  const { action } = await req.json();
  if (action === 'test_anthropic') {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      await c.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] });
      return NextResponse.json({ success: true, message: 'Anthropic API key is valid' });
    } catch (e: unknown) { return NextResponse.json({ success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` }); }
  }
  if (action === 'test_drive') {
    try {
      const { listDriveFiles } = await import('@/lib/drive');
      const files = await listDriveFiles();
      return NextResponse.json({ success: true, message: `Google Drive connected. Found ${files.length} files.`, fileCount: files.length });
    } catch (e: unknown) { return NextResponse.json({ success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` }); }
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}