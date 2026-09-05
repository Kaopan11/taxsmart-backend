/**
 * P5: ลบ user demo@taxsmart.local และข้อมูลที่ cascade ตามมา
 * (invoices, invoice_items, refresh_tokens)
 *
 * รันครั้งเดียวหลังเลิกพึ่ง demo:
 *   npm run cleanup:demo
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '.prisma/client';
import { Pool } from 'pg';

const DEMO_EMAIL = 'demo@taxsmart.local';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    const demo = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: {
        id: true,
        email: true,
        _count: { select: { invoices: true, refreshTokens: true } },
      },
    });

    if (!demo) {
      console.log(`No user found with email ${DEMO_EMAIL} — nothing to delete.`);
      return;
    }

    await prisma.user.delete({ where: { id: demo.id } });

    console.log(
      `Deleted ${DEMO_EMAIL} (${demo._count.invoices} invoices, ${demo._count.refreshTokens} refresh tokens).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
