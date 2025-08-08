import { NextRequest, NextResponse } from 'next/server';
import { processNextInQueue } from '@/lib/langgraph/tools';

export async function POST(_req: NextRequest) {
  const result = await processNextInQueue();
  return NextResponse.json(result);
}
