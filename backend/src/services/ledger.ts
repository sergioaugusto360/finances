import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface JournalLine {
  account_id: number;
  cost_center_id?: number | null;
  debit?: number;
  credit?: number;
}

export interface JournalInput {
  entry_date: string;
  description: string;
  source: 'MANUAL' | 'TITULO' | 'BAIXA' | 'MOVIMENTO' | 'TRANSFERENCIA' | 'SALDO_INICIAL' | 'ESTORNO';
  source_id?: number | null;
  created_by?: number | null;
  lines: JournalLine[];
}

const keyCache = new Map<string, number>();

/** Retorna o id de uma conta do sistema (ex.: CLIENTES, FORNECEDORES). */
export async function systemAccount(client: PoolClient, key: string): Promise<number> {
  const cached = keyCache.get(key);
  if (cached) return cached;
  const [row] = await query<{ id: number }>('SELECT id FROM accounts WHERE system_key = $1', [key], client);
  if (!row) throw new HttpError(500, `Conta do sistema não configurada: ${key}`);
  keyCache.set(key, row.id);
  return row.id;
}

/**
 * Grava um lançamento contábil de partidas dobradas.
 * Garante que débitos = créditos e que as contas aceitam lançamentos.
 */
export async function postEntry(client: PoolClient, input: JournalInput): Promise<number> {
  const lines = input.lines
    .map((l) => ({ ...l, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) }))
    .filter((l) => l.debit > 0 || l.credit > 0);

  const totalD = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalC = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (lines.length < 2 || totalD !== totalC || totalD === 0) {
    throw new HttpError(400, `Lançamento desbalanceado (D ${totalD} / C ${totalC})`);
  }

  const ids = [...new Set(lines.map((l) => l.account_id))];
  const accs = await query<{ id: number; accepts_entries: boolean; active: boolean }>(
    'SELECT id, accepts_entries, active FROM accounts WHERE id = ANY($1)',
    [ids],
    client,
  );
  if (accs.length !== ids.length) throw new HttpError(400, 'Conta contábil inexistente no lançamento');
  const bad = accs.find((a) => !a.accepts_entries || !a.active);
  if (bad) throw new HttpError(400, `A conta ${bad.id} é sintética ou inativa e não aceita lançamentos`);

  const [entry] = await query<{ id: number }>(
    `INSERT INTO journal_entries (entry_date, description, source, source_id, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.entry_date, input.description, input.source, input.source_id ?? null, input.created_by ?? null],
    client,
  );
  for (const l of lines) {
    await query(
      `INSERT INTO journal_lines (entry_id, account_id, cost_center_id, debit, credit)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.id, l.account_id, l.cost_center_id ?? null, l.debit, l.credit],
      client,
    );
  }
  return entry.id;
}

/** Estorna um lançamento invertendo débitos e créditos. */
export async function reverseEntry(client: PoolClient, entryId: number, date: string, userId?: number) {
  const lines = await query<JournalLine & { debit: number; credit: number }>(
    'SELECT account_id, cost_center_id, debit, credit FROM journal_lines WHERE entry_id = $1',
    [entryId],
    client,
  );
  const [orig] = await query<{ description: string }>('SELECT description FROM journal_entries WHERE id = $1', [entryId], client);
  return postEntry(client, {
    entry_date: date,
    description: `Estorno: ${orig?.description ?? entryId}`,
    source: 'ESTORNO',
    source_id: entryId,
    created_by: userId,
    lines: lines.map((l) => ({ account_id: l.account_id, cost_center_id: l.cost_center_id, debit: l.credit, credit: l.debit })),
  });
}
