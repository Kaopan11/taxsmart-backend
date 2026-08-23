/**
 * P5: ลบ user demo@taxsmart.local และข้อมูลที่ cascade ตามมา
 * (invoices, invoice_items, refresh_tokens)
 *
 * รันครั้งเดียวหลังเลิกพึ่ง demo:
 *   npm run cleanup:demo
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '.prisma/client';

const DEMO_EMAIL = 'demo@taxsmart.local';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
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
      console.log(`No user with email ${DEMO_EMAIL} — nothing to delete.`);
      return;
    }

    console.log(
      `Deleting ${demo.email} (invoices=${demo._count.invoices}, refreshTokens=${demo._count.refreshTokens})...`,
    );

    // onDelete: Cascade ใน schema จะลบ invoices / refresh_tokens ให้
    await prisma.user.delete({ where: { id: demo.id } });

    console.log('Demo user cleanup done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
