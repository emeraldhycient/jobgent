import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HfInference } from '@huggingface/inference';

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '');

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, summary } = body;
  if (!summary) return NextResponse.json({ error: 'Missing summary' }, { status: 400 });
  const model = process.env.HUGGINGFACE_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
  const embedding = await hf.featureExtraction({ model, inputs: summary.slice(0, 8000) });
  const vector = Array.isArray(embedding[0]) ? embedding[0] : embedding;
  // @ts-ignore - ensure prisma generate has run
  const profile = await prisma.userProfile.create({ data: { name, summary, embedding: vector as any } });
  return NextResponse.json({ profile });
}
