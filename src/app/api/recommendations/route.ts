import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Job, UserProfile } from '@prisma/client';

function cosine(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return (dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9));
}

function getEmbeddingVector(json: unknown): number[] | null {
  if (!json) return null;
  if (Array.isArray(json) && json.every((v) => typeof v === 'number')) return json as number[];
  return null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const userId = params.get('userId');
  const limit = parseInt(params.get('limit') || '10');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  const user: UserProfile | null = await prisma.userProfile.findUnique({ where: { id: userId } });
  const userVec = getEmbeddingVector(user?.embedding);
  if (!user || !userVec) return NextResponse.json({ jobs: [] });
  const allJobs: Job[] = await prisma.job.findMany({ take: 500, orderBy: { createdAt: 'desc' } });
  const rescored = allJobs
    .map((j) => ({ job: j, vec: getEmbeddingVector((j as unknown as Job).embedding) }))
    .filter((x): x is { job: Job; vec: number[] } => Array.isArray(x.vec))
    .map(({ job, vec }) => ({ job, score: cosine(userVec, vec) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, limit);
  return NextResponse.json({ jobs: rescored.map(r => ({ ...r.job, score: r.score })) });
}
