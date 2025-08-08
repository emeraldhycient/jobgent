import { NextResponse, NextRequest } from 'next/server';
import { processNextInQueue } from '@/lib/langgraph/tools';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');
  if (mode === 'loop') {
    let steps = 0;
    const maxSteps = 200; // safety cap
    // Simple loop: process until idle or cap
    while (steps < maxSteps) {
      const res = await processNextInQueue();
      steps += 1;
      if (res.status === 'idle') break;
    }
    return NextResponse.json({ status: 'loop-finished', steps });
  }
  const result = await processNextInQueue();
  return NextResponse.json(result);
}
