import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function cosine(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return (dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9));
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const userId = params.get('userId');
  const limit = parseInt(params.get('limit') || '10');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  const user = await prisma.userProfile.findUnique({ where: { id: userId } });
  if (!user || !user.embedding) return NextResponse.json({ jobs: [] });
  const allJobs = await prisma.job.findMany({ take: 500, orderBy: { createdAt: 'desc' } });
  const userVec: number[] = user.embedding as any;
  const rescored = allJobs
    .filter(j => (j as any).embedding)
    .map(j => ({ job: j, score: cosine(userVec, (j as any).embedding as any) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, limit);
  return NextResponse.json({ jobs: rescored.map(r => ({ ...r.job, score: r.score })) });
}
