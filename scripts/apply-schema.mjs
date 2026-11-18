/**
 * Aplica o schema no Neon usando DATABASE_URL do .env.
 * Uso: node scripts/apply-schema.mjs [arquivo.sql]
 */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv() {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

loadEnv();

const file = process.argv[2] ?? 'neon/schema.sql';
const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL não definida no .env');
  process.exit(1);
}

const sql = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await pool.query(sql);
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log(`Schema aplicado. Tabelas: ${rows.map((r) => r.table_name).join(', ')}`);
} catch (e) {
  console.error('Falha ao aplicar o schema:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
