import { Redis } from '@upstash/redis';
import { PlaybookData, ChecklistData } from '@/types';

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export interface GenerationJob {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  createdAt: string;
  updatedAt: string;
  result?: {
    playbook?: PlaybookData;
    checklist?: ChecklistData;
    driveFileCount?: number;
    hasMSA?: boolean;
    meta?: Record<string, unknown>;
  };
  error?: string;
  progress?: string;
}

const JOB_PREFIX = 'tyfone:job:';
const JOB_TTL_SECONDS = 60 * 30;

function jobKey(id: string) { return `${JOB_PREFIX}${id}`; }

export async function createJob(id: string): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error('Job queue not configured — Redis (KV_REST_API_URL/TOKEN) required for background generation');
  const job: GenerationJob = {
    id, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await r.set(jobKey(id), job, { ex: JOB_TTL_SECONDS });
}

export async function updateJob(id: string, patch: Partial<GenerationJob>): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const existing = await r.get<GenerationJob>(jobKey(id));
  if (!existing) return;
  const updated: GenerationJob = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await r.set(jobKey(id), updated, { ex: JOB_TTL_SECONDS });
}

export async function getJob(id: string): Promise<GenerationJob | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<GenerationJob>(jobKey(id));
}

export function isJobQueueAvailable(): boolean {
  return !!getRedis();
}
