import { NextRequest, NextResponse } from 'next/server';
import { runDiscoveryAndCrawl } from '@/lib/langgraph/graph';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = body.prompt as string;
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  const result = await runDiscoveryAndCrawl(prompt, 10);
  return NextResponse.json({ trace: result });
}
