// Runs during npm postinstall to clear any stuck failed migrations.
// Uses pg directly — safe to run before prisma generate.
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) { console.log('fix-migration: no DATABASE_URL, skipping'); process.exit(0); }

// Render databases require SSL; rejectUnauthorized:false works for self-signed certs
const client = new Client({
  connectionString: url,
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
});

client.connect()
  .then(() => client.query(`
    UPDATE "_prisma_migrations"
    SET "rolled_back_at" = NOW()
    WHERE "migration_name" = '20260613000001_add_shot_notes'
    AND "rolled_back_at" IS NULL
    AND "finished_at"   IS NULL
  `))
  .then(r => console.log('fix-migration: updated', r.rowCount, 'row(s)'))
  .catch(e => console.warn('fix-migration skipped:', e.message))
  .finally(() => client.end().catch(() => {}));
