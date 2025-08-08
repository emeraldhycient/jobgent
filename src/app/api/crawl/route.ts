import { NextResponse } from 'next/server';
import { processNextInQueue } from '@/lib/langgraph/tools';

export async function POST() {
  const result = await processNextInQueue();
  return NextResponse.json(result);
}
