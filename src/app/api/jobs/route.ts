import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const q = searchParams.get('q');
  const take = parseInt(searchParams.get('take') || '25');
  const where = q ? { OR: [ { title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } } ] } : {};
  const jobs = await prisma.job.findMany({ where, take, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ jobs });
}
