import pg from 'pg';
import { env } from '../config/env.js';

// NUMERIC -> number (valores monetários com 2 casas cabem com folga em double)
pg.types.setTypeParser(1700, (v) => parseFloat(v));
// BIGINT -> number
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
// DATE -> string 'YYYY-MM-DD' (evita deslocamento de fuso horário)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool) {
  const res = await db.query<T>(text, params);
  return res.rows;
}

/** Executa a função dentro de uma transação; faz rollback em caso de erro. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
