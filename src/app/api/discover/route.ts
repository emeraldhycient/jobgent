import { NextRequest, NextResponse } from 'next/server';
import { queryTavilyAndStoreUrls } from '@/lib/langgraph/tools';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = body.prompt as string;
  const mode = (body.mode as string | undefined) || 'single';
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  if (mode === 'auto') {
    const { autoDiscoverAndEnqueue } = await import('@/lib/langgraph/tools');
    const res = await autoDiscoverAndEnqueue(prompt);
    return NextResponse.json({ ...res });
  }
  const result = await queryTavilyAndStoreUrls(prompt);
  return NextResponse.json({ nextUrls: result.urls, queueCount: result.queueCount, totalFound: result.totalFound });
}
