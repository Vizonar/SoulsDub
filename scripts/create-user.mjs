/**
 * Cria um usuário do painel Vox Trupe Studios.
 *
 * Uso:
 *   node scripts/create-user.mjs <usuario> <senha> [nome] [admin|reviewer]
 *
 * Exemplo:
 *   node scripts/create-user.mjs vox minhasenha123 "Vox Admin" admin
 */
import { readFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { Pool } from 'pg';

function loadEnv() {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* sem .env: usa variáveis do ambiente */
  }
}

function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
}

loadEnv();

const [username, password, displayName, role = 'admin'] = process.argv.slice(2);

if (!username || !password) {
  console.error('Uso: node scripts/create-user.mjs <usuario> <senha> [nome] [admin|reviewer]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('A senha precisa ter no mínimo 8 caracteres.');
  process.exit(1);
}
if (!['admin', 'reviewer'].includes(role)) {
  console.error('O papel deve ser "admin" ou "reviewer".');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida (preencha o .env).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           display_name  = EXCLUDED.display_name,
           role          = EXCLUDED.role
     RETURNING id, username, display_name, role`,
    [username.trim().toLowerCase(), hashPassword(password), (displayName ?? username).trim(), role],
  );
  console.log(`Usuário pronto: ${rows[0].username} (${rows[0].role}) — ${rows[0].display_name}`);
} catch (e) {
  console.error('Falha ao criar usuário:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
