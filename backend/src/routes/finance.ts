/** Contas bancárias, movimentos, lançamentos contábeis e relatórios. */
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { ah, HttpError } from '../middleware/errors.js';
import { authenticate, canWrite } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { createBankAccount, createManualTransaction, transfer } from '../services/banking.js';
import { postEntry } from '../services/ledger.js';
import * as reports from '../services/reports.js';
import { id, isoDate, money, optionalId, periodQuery, positiveMoney } from './schemas.js';

const router = Router();
router.use(authenticate);

// ---------- Contas bancárias ----------
router.get(
  '/bank-accounts',
  ah(async (_req, res) => {
    res.json(
      await query(
        `SELECT ba.*, a.code AS account_code,
                COALESCE(ROUND(SUM(CASE WHEN bt.direction='ENTRADA' THEN bt.amount ELSE -bt.amount END), 2), 0) AS saldo
           FROM bank_accounts ba JOIN accounts a ON a.id = ba.account_id
           LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
          GROUP BY ba.id, a.code ORDER BY ba.name`,
      ),
    );
  }),
);

router.post(
  '/bank-accounts',
  canWrite,
  ah(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(2).max(120),
        bank: z.string().max(80).nullish(),
        agency: z.string().max(20).nullish(),
        number: z.string().max(30).nullish(),
        initial_balance: z.coerce.number().finite().default(0),
        opening_date: isoDate.optional(),
      })
      .parse(req.body);
    const newId = await withTransaction(async (c) => {
      const bankId = await createBankAccount(c, b, req.user!.id);
      await audit(req, 'CRIAR', 'bank_accounts', bankId, b, c);
      return bankId;
    });
    res.status(201).json({ id: newId });
  }),
);

router.put(
  '/bank-accounts/:id',
  canWrite,
  ah(async (req, res) => {
    const bId = id.parse(req.params.id);
    const b = z
      .object({ name: z.string().min(2).max(120), bank: z.string().max(80).nullish(), agency: z.string().max(20).nullish(), number: z.string().max(30).nullish(), active: z.boolean() })
      .parse(req.body);
    await query('UPDATE bank_accounts SET name=$1, bank=$2, agency=$3, number=$4, active=$5 WHERE id=$6', [
      b.name, b.bank ?? null, b.agency ?? null, b.number ?? null, b.active, bId,
    ]);
    await query('UPDATE accounts SET name = $1 WHERE id = (SELECT account_id FROM bank_accounts WHERE id = $2)', [b.name, bId]);
    await audit(req, 'ALTERAR', 'bank_accounts', bId, b);
    res.json({ ok: true });
  }),
);

router.post(
  '/bank-transactions',
  canWrite,
  ah(async (req, res) => {
    const b = z
      .object({
        bank_account_id: id,
        tx_date: isoDate,
        direction: z.enum(['ENTRADA', 'SAIDA']),
        amount: positiveMoney,
        description: z.string().min(2).max(200),
        activity: z.enum(['OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO']),
        counterpart_account_id: id,
        cost_center_id: optionalId,
      })
      .parse(req.body);
    const txId = await withTransaction(async (c) => {
      const t = await createManualTransaction(c, b, req.user!.id);
      await audit(req, 'CRIAR', 'bank_transactions', t, b, c);
      return t;
    });
    res.status(201).json({ id: txId });
  }),
);

router.post(
  '/transfers',
  canWrite,
  ah(async (req, res) => {
    const b = z
      .object({ from_id: id, to_id: id, amount: positiveMoney, tx_date: isoDate, description: z.string().max(200).optional() })
      .parse(req.body);
    const entryId = await withTransaction(async (c) => {
      const e = await transfer(c, b, req.user!.id);
      await audit(req, 'TRANSFERIR', 'bank_transactions', e, b, c);
      return e;
    });
    res.status(201).json({ entry_id: entryId });
  }),
);

// ---------- Lançamentos contábeis ----------
router.get(
  '/journal',
  ah(async (req, res) => {
    const q = z.object({ start: isoDate, end: isoDate, account_id: optionalId }).parse(req.query);
    const entries = await query(
      `SELECT je.id, je.entry_date, je.description, je.source, je.source_id, u.name AS user_name,
              json_agg(json_build_object('account_id', a.id, 'code', a.code, 'name', a.name,
                                         'debit', jl.debit, 'credit', jl.credit) ORDER BY jl.id) AS lines
         FROM journal_entries je
         JOIN journal_lines jl ON jl.entry_id = je.id
         JOIN accounts a ON a.id = jl.account_id
         LEFT JOIN users u ON u.id = je.created_by
        WHERE je.entry_date BETWEEN $1 AND $2
          AND ($3::int IS NULL OR EXISTS (SELECT 1 FROM journal_lines x WHERE x.entry_id = je.id AND x.account_id = $3))
        GROUP BY je.id, u.name
        ORDER BY je.entry_date DESC, je.id DESC LIMIT 500`,
      [q.start, q.end, q.account_id ?? null],
    );
    res.json(entries);
  }),
);

router.post(
  '/journal',
  canWrite,
  ah(async (req, res) => {
    const b = z
      .object({
        entry_date: isoDate,
        description: z.string().min(2).max(200),
        lines: z
          .array(z.object({ account_id: id, cost_center_id: optionalId, debit: money.default(0), credit: money.default(0) }))
          .min(2),
      })
      .parse(req.body);
    const entryId = await withTransaction(async (c) => {
      // contas bancárias só se movimentam por baixas/movimentos/transferências (mantém o caixa conciliado)
      const bankLines = await query(
        `SELECT 1 FROM accounts a JOIN accounts g ON g.id = a.parent_id
          WHERE g.system_key = 'GRUPO_BANCOS' AND a.id = ANY($1) LIMIT 1`,
        [b.lines.map((l) => l.account_id)],
        c,
      );
      if (bankLines.length) throw new HttpError(400, 'Use Fluxo de caixa › Movimento avulso para movimentar contas bancárias');
      const e = await postEntry(c, { ...b, source: 'MANUAL', created_by: req.user!.id });
      await audit(req, 'CRIAR', 'journal_entries', e, b, c);
      return e;
    });
    res.status(201).json({ id: entryId });
  }),
);

// ---------- Relatórios e indicadores ----------
router.get('/reports/dashboard', ah(async (_req, res) => res.json(await reports.dashboard())));

router.get(
  '/reports/dre',
  ah(async (req, res) => {
    const q = periodQuery.parse(req.query);
    res.json(await reports.dre(q.start, q.end, q.cost_center_id));
  }),
);

router.get(
  '/reports/dre-monthly',
  ah(async (req, res) => {
    const q = z.object({ year: z.coerce.number().int(), cost_center_id: optionalId }).parse(req.query);
    res.json(await reports.dreMonthly(q.year, q.cost_center_id));
  }),
);

router.get(
  '/reports/balance-sheet',
  ah(async (req, res) => {
    const q = z.object({ as_of: isoDate }).parse(req.query);
    res.json(await reports.balanceSheet(q.as_of));
  }),
);

router.get(
  '/reports/cash-flow',
  ah(async (req, res) => {
    const q = periodQuery.parse(req.query);
    res.json(await reports.cashFlow(q.start, q.end, q.bank_account_id));
  }),
);

router.get(
  '/reports/cash-projection',
  ah(async (req, res) => {
    const q = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) }).parse(req.query);
    res.json(await reports.cashProjection(q.days));
  }),
);

router.get(
  '/reports/indicators',
  ah(async (req, res) => {
    const q = periodQuery.parse(req.query);
    res.json(await reports.indicators(q.start, q.end));
  }),
);

export default router;
