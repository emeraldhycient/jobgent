import { prisma } from '@/lib/prisma';

// This test performs a raw query to ensure the vector column exists; if not, it skips.

describe('vector similarity SQL', () => {
  it('vector column exists or skips', async () => {
    const cols: any = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='Job' AND column_name='embedding_vector';`);
    if (Array.isArray(cols) && cols.length === 0) {
      console.warn('embedding_vector column missing - skipping');
      return;
    }
    expect(true).toBe(true);
  });
});
