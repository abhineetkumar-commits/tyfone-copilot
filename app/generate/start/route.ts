import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
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

  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) {
    return NextResponse.json({
      error: 'Background generation requires QSTASH_TOKEN env var. Get one free at console.upstash.com under QStash.',
    }, { status: 503 });
  }

  try {
    const fd = await req.formData();
    const id = randomId();
    await createJob(id);

    // Convert the FormData into a plain JSON-serialisable object so it can
    // be sent through QStash (which delivers JSON payloads with guaranteed
    // delivery and automatic retries — far more reliable than an unawaited
    // fetch() or after() callback, which Vercel can terminate unpredictably
    // once the parent function's response has been sent).
    const payload: Record<string, string> = { jobId: id };
    const fileFields: { field: string; name: string; content: string }[] = [];

    for (const [key, value] of fd.entries()) {
      if (value instanceof File) {
        // Encode file contents as base64 so they survive JSON transport
        const buf = await value.arrayBuffer();
        const base64 = Buffer.from(buf).toString('base64');
        fileFields.push({ field: key, name: value.name, content: base64 });
      } else {
        payload[key] = value as string;
      }
    }
    payload.__files = JSON.stringify(fileFields);

    // NEXTAUTH_URL is always the stable production domain.
    // VERCEL_URL changes per deployment so QStash could try an old URL.
    const publicOrigin = (process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.nextUrl.origin);
    const processUrl = `${publicOrigin}/api/generate/process`;
    console.log(`[generate/start] processUrl=${processUrl} job=${id}`);

    const qstash = new Client({ token: qstashToken });
    const publishResult = await qstash.publishJSON({
      url: processUrl,
      body: payload,
      retries: 3,
    });
    console.log(`[generate/start] QStash messageId=${publishResult.messageId} job=${id}`);

    return NextResponse.json({ jobId: id });
  } catch (e: unknown) {
    console.error('[generate/start] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}