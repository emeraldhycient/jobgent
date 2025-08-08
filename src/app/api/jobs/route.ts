import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const q = searchParams.get('q');
  const take = parseInt(searchParams.get('take') || '25');
  const where: Prisma.JobWhereInput | undefined = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' as Prisma.QueryMode } },
          { description: { contains: q, mode: 'insensitive' as Prisma.QueryMode } }
        ]
      }
    : undefined;
  const jobs = await prisma.job.findMany({ where, take, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ jobs });
}
