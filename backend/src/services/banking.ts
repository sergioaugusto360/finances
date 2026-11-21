import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { postEntry, round2, systemAccount } from './ledger.js';

export interface BankAccountInput {
  name: string;
  bank?: string | null;
  agency?: string | null;
  number?: string | null;
  initial_balance?: number;
  opening_date?: string;
}

/** Cria a conta bancária + conta analítica sob 1.1.1 e o lançamento de saldo inicial. */
export async function createBankAccount(client: PoolClient, input: BankAccountInput, userId: number) {
  const groupId = await systemAccount(client, 'GRUPO_BANCOS');
  const [{ next }] = await query<{ next: number }>(
    `SELECT COALESCE(MAX(split_part(code, '.', 4)::int), 0) + 1 AS next
       FROM accounts WHERE parent_id = $1`,
    [groupId],
    client,
  );
  const [acc] = await query<{ id: number }>(
    `INSERT INTO accounts (code, name, type, subtype, parent_id, accepts_entries)
     VALUES ($1, $2, 'ATIVO', 'CIRCULANTE', $3, TRUE) RETURNING id`,
    [`1.1.1.${next}`, input.name, groupId],
    client,
  );
  const initial = round2(input.initial_balance ?? 0);
  const [bank] = await query<{ id: number }>(
    `INSERT INTO bank_accounts (name, bank, agency, number, account_id, initial_balance)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.name, input.bank ?? null, input.agency ?? null, input.number ?? null, acc.id, initial],
    client,
  );

  if (initial !== 0) {
    const date = input.opening_date ?? new Date().toISOString().slice(0, 10);
    const equity = await systemAccount(client, 'SALDOS_INICIAIS');
    const abs = Math.abs(initial);
    const entryId = await postEntry(client, {
      entry_date: date,
      description: `Saldo inicial: ${input.name}`,
      source: 'SALDO_INICIAL',
      source_id: bank.id,
      created_by: userId,
      lines:
        initial > 0
          ? [{ account_id: acc.id, debit: abs }, { account_id: equity, credit: abs }]
          : [{ account_id: equity, debit: abs }, { account_id: acc.id, credit: abs }],
    });
    await query(
      `INSERT INTO bank_transactions (bank_account_id, tx_date, direction, amount, description, activity, source, source_id, journal_entry_id, created_by)
       VALUES ($1,$2,$3,$4,'Saldo inicial','SALDO_INICIAL','SALDO_INICIAL',$5,$6,$7)`,
      [bank.id, date, initial > 0 ? 'ENTRADA' : 'SAIDA', abs, bank.id, entryId, userId],
      client,
    );
  }
  return bank.id;
}

export interface ManualTxInput {
  bank_account_id: number;
  tx_date: string;
  direction: 'ENTRADA' | 'SAIDA';
  amount: number;
  description: string;
  activity: 'OPERACIONAL' | 'INVESTIMENTO' | 'FINANCIAMENTO';
  counterpart_account_id: number;
  cost_center_id?: number | null;
}

/**
 * Movimento avulso (tarifa, aporte, empréstimo, compra de imobilizado...).
 * A contrapartida contábil é informada pelo usuário.
 */
export async function createManualTransaction(client: PoolClient, input: ManualTxInput, userId: number) {
  const [bank] = await query<{ account_id: number }>('SELECT account_id FROM bank_accounts WHERE id = $1 AND active', [input.bank_account_id], client);
  if (!bank) throw new HttpError(400, 'Conta bancária inválida');
  const groupId = await systemAccount(client, 'GRUPO_BANCOS');
  const [cp] = await query<{ parent_id: number | null }>('SELECT parent_id FROM accounts WHERE id = $1', [input.counterpart_account_id], client);
  if (cp?.parent_id === groupId) throw new HttpError(400, 'Para movimentar entre contas bancárias use Transferência');
  const value = round2(input.amount);
  const entryId = await postEntry(client, {
    entry_date: input.tx_date,
    description: input.description,
    source: 'MOVIMENTO',
    created_by: userId,
    lines:
      input.direction === 'ENTRADA'
        ? [
            { account_id: bank.account_id, debit: value },
            { account_id: input.counterpart_account_id, cost_center_id: input.cost_center_id, credit: value },
          ]
        : [
            { account_id: input.counterpart_account_id, cost_center_id: input.cost_center_id, debit: value },
            { account_id: bank.account_id, credit: value },
          ],
  });
  const [tx] = await query<{ id: number }>(
    `INSERT INTO bank_transactions (bank_account_id, tx_date, direction, amount, description, activity, source, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'MOVIMENTO',$7,$8) RETURNING id`,
    [input.bank_account_id, input.tx_date, input.direction, value, input.description, input.activity, entryId, userId],
    client,
  );
  return tx.id;
}

export async function transfer(
  client: PoolClient,
  input: { from_id: number; to_id: number; amount: number; tx_date: string; description?: string },
  userId: number,
) {
  if (input.from_id === input.to_id) throw new HttpError(400, 'Contas de origem e destino devem ser diferentes');
  const banks = await query<{ id: number; account_id: number; name: string }>(
    'SELECT id, account_id, name FROM bank_accounts WHERE id = ANY($1) AND active',
    [[input.from_id, input.to_id]],
    client,
  );
  const from = banks.find((b) => b.id === input.from_id);
  const to = banks.find((b) => b.id === input.to_id);
  if (!from || !to) throw new HttpError(400, 'Conta bancária inválida');
  const value = round2(input.amount);
  const desc = input.description || `Transferência ${from.name} → ${to.name}`;
  const entryId = await postEntry(client, {
    entry_date: input.tx_date,
    description: desc,
    source: 'TRANSFERENCIA',
    created_by: userId,
    lines: [
      { account_id: to.account_id, debit: value },
      { account_id: from.account_id, credit: value },
    ],
  });
  for (const [bankId, dir] of [[from.id, 'SAIDA'], [to.id, 'ENTRADA']] as const) {
    await query(
      `INSERT INTO bank_transactions (bank_account_id, tx_date, direction, amount, description, activity, source, journal_entry_id, created_by)
       VALUES ($1,$2,$3,$4,$5,'TRANSFERENCIA','TRANSFERENCIA',$6,$7)`,
      [bankId, input.tx_date, dir, value, desc, entryId, userId],
      client,
    );
  }
  return entryId;
}
