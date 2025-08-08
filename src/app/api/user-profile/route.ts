import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HfInference } from '@huggingface/inference';
import type { Prisma } from '@prisma/client';

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '');

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, summary } = body as { name?: string; summary?: string };
  if (!summary) return NextResponse.json({ error: 'Missing summary' }, { status: 400 });
  const model = process.env.HUGGINGFACE_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
  const embedding = await hf.featureExtraction({ model, inputs: summary.slice(0, 8000) });
  const vector = Array.isArray(embedding[0]) ? (embedding[0] as number[]) : (embedding as unknown as number[]);
  const profile = await prisma.userProfile.create({ data: { name, summary, embedding: vector as unknown as Prisma.InputJsonValue } });
  return NextResponse.json({ profile });
}
