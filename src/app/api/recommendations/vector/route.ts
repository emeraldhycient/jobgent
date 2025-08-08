import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}));
  const { embedding, limit = 10 } = body as { embedding: number[]; limit?: number };
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return NextResponse.json({ error: 'embedding (number[]) required' }, { status: 400 });
  }
  const dim = Math.min(embedding.length, 768);
  const vecLiteral = `'[${embedding.slice(0, dim).join(',')}]'`;
  try {
    type Row = { id: string; title: string; company: string; location: string | null; salary: string | null; applyurl?: string; sourceurl: string; distance: number };
    const rowsUnknown = await prisma.$queryRawUnsafe(
      `
      SELECT id, title, company, location, salary, applyUrl, sourceUrl,
             embedding_vector <=> ${vecLiteral}::vector AS distance
      FROM "Job"
      WHERE embedding_vector IS NOT NULL
      ORDER BY embedding_vector <=> ${vecLiteral}::vector ASC
      LIMIT ${Number(limit)};
    `
    );
    const rows = rowsUnknown as unknown as Row[];
    return NextResponse.json({ jobs: rows });
  } catch (e) {
    return NextResponse.json({ error: 'vector search failed', detail: (e as Error).message }, { status: 500 });
  }
}
