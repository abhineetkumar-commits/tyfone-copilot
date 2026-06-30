import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createJob, isJobQueueAvailable } from '@/lib/jobs';

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: NextRequest) {
  if (!isJobQueueAvailable()) {
    return NextResponse.json({
      error: 'Background generation requires Redis (KV_REST_API_URL/KV_REST_API_TOKEN env vars). Without it, large playbooks may exceed the request timeout.',
    }, { status: 503 });
  }

  try {
    const fd = await req.formData();
    const id = randomId();
    await createJob(id);

    // Re-package the form data for the background request
    const forwardFd = new FormData();
    forwardFd.append('jobId', id);
    for (const [key, value] of fd.entries()) {
      forwardFd.append(key, value);
    }

    const origin = req.nextUrl.origin;
    const processUrl = `${origin}/api/generate/process`;

    // Use after() to guarantee this fetch is dispatched even after we return
    // the response below — this is the documented Next.js pattern for
    // triggering background work that should outlive the request/response
    // cycle of the function handling the client's request.
    after(async () => {
      console.log(`[generate/start] after() callback firing for job ${id}, dispatching to ${processUrl}`);
      try {
        const r = await fetch(processUrl, { method: 'POST', body: forwardFd });
        console.log(`[generate/start] process route responded with status ${r.status} for job ${id}`);
      } catch (err) {
        console.error(`[generate/start] failed to trigger background processing for job ${id}:`, err);
      }
    });

    return NextResponse.json({ jobId: id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}