import { NextRequest, NextResponse } from 'next/server';
import { runDiscoveryAndCrawl } from '@/lib/langgraph/graph';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = body.prompt as string;
  const maxIterations = typeof body.maxIterations === 'number' ? Math.max(1, Math.min(body.maxIterations, 1000)) : 10;
  const multiDiscovery = Boolean(body.multiDiscovery);
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  const result = await runDiscoveryAndCrawl(prompt, maxIterations, undefined, { multiDiscovery });
  return NextResponse.json({ trace: result });
}
