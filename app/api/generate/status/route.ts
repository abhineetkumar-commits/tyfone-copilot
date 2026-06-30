import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });

  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });

  return NextResponse.json(job);
}
