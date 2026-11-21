import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { env } from '../config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '../../../database');

async function main() {
  for (const file of ['schema.sql', 'seed.sql']) {
    const sql = fs.readFileSync(path.join(dbDir, file), 'utf8');
    await pool.query(sql);
    console.log(`✔ ${file} aplicado`);
  }

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [env.ADMIN_EMAIL]);
  if (rows.length === 0) {
    const hash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      [env.ADMIN_NAME, env.ADMIN_EMAIL, hash],
    );
    console.log(`✔ Usuário admin criado: ${env.ADMIN_EMAIL}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
