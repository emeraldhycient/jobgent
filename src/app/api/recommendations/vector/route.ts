import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}));
  const { embedding, limit = 10 } = body;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return NextResponse.json({ error: 'embedding (number[]) required' }, { status: 400 });
  }
  const dim = Math.min(embedding.length, 768);
  const vecLiteral = `'[${embedding.slice(0, dim).join(',')}]'`;
  try {
    // Use cosine distance operator <=> (if available) or <-> depending on pgvector version.
    const rows: any = await prisma.$queryRawUnsafe(`
      SELECT id, title, company, location, salary, applyUrl, sourceUrl,
             embedding_vector <=> ${vecLiteral}::vector AS distance
      FROM "Job"
      WHERE embedding_vector IS NOT NULL
      ORDER BY embedding_vector <=> ${vecLiteral}::vector ASC
      LIMIT ${Number(limit)};
    `);
    return NextResponse.json({ jobs: rows });
  } catch (e) {
    return NextResponse.json({ error: 'vector search failed', detail: (e as Error).message }, { status: 500 });
  }
}
