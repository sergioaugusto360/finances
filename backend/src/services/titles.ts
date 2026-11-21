import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { postEntry, reverseEntry, round2, systemAccount } from './ledger.js';

export type TitleKind = 'PAGAR' | 'RECEBER';

export interface TitleInput {
  partner_id?: number | null;
  account_id: number;
  cost_center_id?: number | null;
  description: string;
  document_number?: string | null;
  issue_date: string;
  due_date: string;
  amount: number;
  installments?: number;
  notes?: string | null;
}

export interface PaymentInput {
  bank_account_id: number;
  payment_date: string;
  amount: number;
  interest?: number;
  discount?: number;
  notes?: string | null;
}

function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const ALLOWED_TYPES: Record<TitleKind, string[]> = {
  PAGAR: ['DESPESA', 'CUSTO', 'DEDUCAO', 'ATIVO', 'PASSIVO'],
  RECEBER: ['RECEITA', 'ATIVO', 'PASSIVO', 'PATRIMONIO'],
};

/**
 * Cria um título (ou N parcelas) pelo regime de competência:
 *  PAGAR:   D Despesa/Custo   C Fornecedores a Pagar
 *  RECEBER: D Clientes        C Receita
 */
export async function createTitles(client: PoolClient, kind: TitleKind, input: TitleInput, userId: number) {
  const [acc] = await query<{ type: string; accepts_entries: boolean }>(
    'SELECT type, accepts_entries FROM accounts WHERE id = $1',
    [input.account_id],
    client,
  );
  if (!acc || !acc.accepts_entries) throw new HttpError(400, 'Conta contábil inválida para lançamento');
  if (!ALLOWED_TYPES[kind].includes(acc.type)) {
    throw new HttpError(400, `Conta do tipo ${acc.type} não é permitida em contas a ${kind === 'PAGAR' ? 'pagar' : 'receber'}`);
  }

  const n = Math.max(1, input.installments ?? 1);
  const groupId = n > 1 ? randomUUID() : null;
  const base = round2(Math.floor((input.amount / n) * 100) / 100);
  const counterpart = await systemAccount(client, kind === 'PAGAR' ? 'FORNECEDORES' : 'CLIENTES');
  const ids: number[] = [];

  for (let i = 0; i < n; i++) {
    const value = i === n - 1 ? round2(input.amount - base * (n - 1)) : base;
    const due = addMonths(input.due_date, i);
    const desc = n > 1 ? `${input.description} (${i + 1}/${n})` : input.description;

    const [title] = await query<{ id: number }>(
      `INSERT INTO financial_titles
         (kind, partner_id, account_id, cost_center_id, description, document_number,
          issue_date, due_date, amount, installment, installments_total, group_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [kind, input.partner_id ?? null, input.account_id, input.cost_center_id ?? null, desc,
       input.document_number ?? null, input.issue_date, due, value, i + 1, n, groupId, input.notes ?? null, userId],
      client,
    );

    const lines =
      kind === 'PAGAR'
        ? [
            { account_id: input.account_id, cost_center_id: input.cost_center_id, debit: value },
            { account_id: counterpart, credit: value },
          ]
        : [
            { account_id: counterpart, debit: value },
            { account_id: input.account_id, cost_center_id: input.cost_center_id, credit: value },
          ];

    const entryId = await postEntry(client, {
      entry_date: input.issue_date,
      description: `${kind === 'PAGAR' ? 'Provisão a pagar' : 'Provisão a receber'}: ${desc}`,
      source: 'TITULO',
      source_id: title.id,
      created_by: userId,
      lines,
    });
    await query('UPDATE financial_titles SET journal_entry_id = $1 WHERE id = $2', [entryId, title.id], client);
    ids.push(title.id);
  }
  return ids;
}

/**
 * Baixa (total ou parcial) de um título.
 *  PAGAR:   D Fornecedores (principal) + D Juros pagos   / C Banco (líquido) + C Descontos obtidos
 *  RECEBER: D Banco (líquido) + D Descontos concedidos   / C Clientes (principal) + C Juros recebidos
 */
export async function payTitle(client: PoolClient, titleId: number, p: PaymentInput, userId: number) {
  const [title] = await query<{
    id: number; kind: TitleKind; amount: number; paid_amount: number; status: string; description: string; cost_center_id: number | null;
  }>('SELECT * FROM financial_titles WHERE id = $1 FOR UPDATE', [titleId], client);
  if (!title) throw new HttpError(404, 'Título não encontrado');
  if (title.status === 'CANCELADO' || title.status === 'LIQUIDADO') throw new HttpError(400, `Título ${title.status.toLowerCase()}`);

  const remaining = round2(title.amount - title.paid_amount);
  const amount = round2(p.amount);
  if (amount > remaining) throw new HttpError(400, `Valor excede o saldo em aberto (${remaining.toFixed(2)})`);

  const interest = round2(p.interest ?? 0);
  const discount = round2(p.discount ?? 0);
  const net = round2(amount + interest - discount);
  if (net <= 0) throw new HttpError(400, 'Valor líquido da baixa deve ser positivo');

  const [bank] = await query<{ account_id: number; active: boolean }>(
    'SELECT account_id, active FROM bank_accounts WHERE id = $1',
    [p.bank_account_id],
    client,
  );
  if (!bank || !bank.active) throw new HttpError(400, 'Conta bancária inválida');

  const cc = title.cost_center_id;
  let lines;
  if (title.kind === 'PAGAR') {
    lines = [
      { account_id: await systemAccount(client, 'FORNECEDORES'), debit: amount },
      { account_id: await systemAccount(client, 'JUROS_PAGOS'), cost_center_id: cc, debit: interest },
      { account_id: bank.account_id, credit: net },
      { account_id: await systemAccount(client, 'DESCONTOS_OBTIDOS'), cost_center_id: cc, credit: discount },
    ];
  } else {
    lines = [
      { account_id: bank.account_id, debit: net },
      { account_id: await systemAccount(client, 'DESCONTOS_CONCEDIDOS'), cost_center_id: cc, debit: discount },
      { account_id: await systemAccount(client, 'CLIENTES'), credit: amount },
      { account_id: await systemAccount(client, 'JUROS_RECEBIDOS'), cost_center_id: cc, credit: interest },
    ];
  }

  const entryId = await postEntry(client, {
    entry_date: p.payment_date,
    description: `${title.kind === 'PAGAR' ? 'Pagamento' : 'Recebimento'}: ${title.description}`,
    source: 'BAIXA',
    source_id: title.id,
    created_by: userId,
    lines,
  });

  const [payment] = await query<{ id: number }>(
    `INSERT INTO title_payments (title_id, bank_account_id, payment_date, amount, interest, discount, notes, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [title.id, p.bank_account_id, p.payment_date, amount, interest, discount, p.notes ?? null, entryId, userId],
    client,
  );

  await query(
    `INSERT INTO bank_transactions (bank_account_id, tx_date, direction, amount, description, activity, source, source_id, journal_entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,'OPERACIONAL','BAIXA',$6,$7,$8)`,
    [p.bank_account_id, p.payment_date, title.kind === 'PAGAR' ? 'SAIDA' : 'ENTRADA', net, title.description, payment.id, entryId, userId],
    client,
  );

  const newPaid = round2(title.paid_amount + amount);
  const status = newPaid >= title.amount ? 'LIQUIDADO' : 'PARCIAL';
  await query('UPDATE financial_titles SET paid_amount = $1, status = $2 WHERE id = $3', [newPaid, status, title.id], client);
  return { payment_id: payment.id, status };
}

/** Cancela um título sem baixas, estornando a provisão contábil. */
export async function cancelTitle(client: PoolClient, titleId: number, userId: number) {
  const [title] = await query<{ status: string; paid_amount: number; journal_entry_id: number | null }>(
    'SELECT status, paid_amount, journal_entry_id FROM financial_titles WHERE id = $1 FOR UPDATE',
    [titleId],
    client,
  );
  if (!title) throw new HttpError(404, 'Título não encontrado');
  if (title.status === 'CANCELADO') throw new HttpError(400, 'Título já cancelado');
  if (title.paid_amount > 0) throw new HttpError(400, 'Título possui baixas; estorne-as antes de cancelar');
  if (title.journal_entry_id) {
    await reverseEntry(client, title.journal_entry_id, new Date().toISOString().slice(0, 10), userId);
  }
  await query(`UPDATE financial_titles SET status = 'CANCELADO' WHERE id = $1`, [titleId], client);
}

/** Estorna a última baixa de um título (contábil + movimento bancário). */
export async function reversePayment(client: PoolClient, paymentId: number, userId: number) {
  const [pay] = await query<{ id: number; title_id: number; amount: number; journal_entry_id: number }>(
    'SELECT * FROM title_payments WHERE id = $1',
    [paymentId],
    client,
  );
  if (!pay) throw new HttpError(404, 'Baixa não encontrada');
  await reverseEntry(client, pay.journal_entry_id, new Date().toISOString().slice(0, 10), userId);
  await query(`DELETE FROM bank_transactions WHERE source = 'BAIXA' AND source_id = $1`, [pay.id], client);
  await query('DELETE FROM title_payments WHERE id = $1', [pay.id], client);
  await query(
    `UPDATE financial_titles
        SET paid_amount = paid_amount - $1,
            status = CASE WHEN paid_amount - $1 <= 0 THEN 'ABERTO' ELSE 'PARCIAL' END
      WHERE id = $2`,
    [pay.amount, pay.title_id],
    client,
  );
}
