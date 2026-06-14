// Marks a stuck failed migration as rolled-back so prisma migrate deploy can proceed.
// Safe to run on every deploy — the WHERE clause is a no-op once the migration is resolved.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.$executeRawUnsafe(
  `UPDATE "_prisma_migrations"
   SET "rolled_back_at" = NOW()
   WHERE "migration_name" = '20260613000001_add_shot_notes'
   AND "rolled_back_at" IS NULL
   AND "finished_at" IS NULL`
)
  .then((n) => { console.log(`fix-migration: updated ${n} row(s)`); })
  .catch((e) => { console.warn('fix-migration skipped:', e.message); })
  .finally(() => prisma.$disconnect());
