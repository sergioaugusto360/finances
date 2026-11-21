/** Contas a pagar (despesas) e contas a receber (receitas) — mesmo modelo, rotas distintas. */
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { ah, HttpError } from '../middleware/errors.js';
import { authenticate, canWrite } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { cancelTitle, createTitles, payTitle, reversePayment, type TitleKind } from '../services/titles.js';
import { aging } from '../services/reports.js';
import { id, isoDate, money, optionalId, positiveMoney } from './schemas.js';

export function titlesRouter(kind: TitleKind) {
  const router = Router();
  router.use(authenticate);
  const entity = kind === 'PAGAR' ? 'contas_pagar' : 'contas_receber';

  router.get(
    '/',
    ah(async (req, res) => {
      const q = z
        .object({
          status: z.string().optional(), // ABERTO,PARCIAL...
          start: isoDate.optional(),
          end: isoDate.optional(),
          partner_id: optionalId,
          cost_center_id: optionalId,
          search: z.string().optional(),
          overdue: z.enum(['true', 'false']).optional(),
        })
        .parse(req.query);
      const rows = await query(
        `SELECT t.*, ROUND(t.amount - t.paid_amount, 2) AS saldo,
                p.name AS partner_name, a.code AS account_code, a.name AS account_name, cc.name AS cost_center_name,
                (t.status IN ('ABERTO','PARCIAL') AND t.due_date < CURRENT_DATE) AS vencido
           FROM financial_titles t
           LEFT JOIN partners p ON p.id = t.partner_id
           JOIN accounts a ON a.id = t.account_id
           LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id
          WHERE t.kind = $1
            AND ($2::text[] IS NULL OR t.status = ANY($2))
            AND ($3::date IS NULL OR t.due_date >= $3)
            AND ($4::date IS NULL OR t.due_date <= $4)
            AND ($5::int IS NULL OR t.partner_id = $5)
            AND ($6::int IS NULL OR t.cost_center_id = $6)
            AND ($7::text IS NULL OR t.description ILIKE '%' || $7 || '%' OR t.document_number ILIKE '%' || $7 || '%' OR p.name ILIKE '%' || $7 || '%')
            AND ($8::boolean IS NULL OR NOT $8 OR (t.status IN ('ABERTO','PARCIAL') AND t.due_date < CURRENT_DATE))
          ORDER BY t.due_date, t.id
          LIMIT 1000`,
        [
          kind,
          q.status ? q.status.split(',') : null,
          q.start ?? null,
          q.end ?? null,
          q.partner_id ?? null,
          q.cost_center_id ?? null,
          q.search || null,
          q.overdue ? q.overdue === 'true' : null,
        ],
      );
      res.json(rows);
    }),
  );

  router.get('/aging', ah(async (_req, res) => res.json(await aging(kind))));

  router.get(
    '/:id',
    ah(async (req, res) => {
      const tId = id.parse(req.params.id);
      const [title] = await query('SELECT * FROM financial_titles WHERE id = $1 AND kind = $2', [tId, kind]);
      if (!title) throw new HttpError(404, 'Título não encontrado');
      const payments = await query(
        `SELECT tp.*, ba.name AS bank_name, u.name AS user_name FROM title_payments tp
           JOIN bank_accounts ba ON ba.id = tp.bank_account_id LEFT JOIN users u ON u.id = tp.created_by
          WHERE tp.title_id = $1 ORDER BY tp.payment_date, tp.id`,
        [tId],
      );
      res.json({ ...title, payments });
    }),
  );

  router.post(
    '/',
    canWrite,
    ah(async (req, res) => {
      const b = z
        .object({
          partner_id: optionalId,
          account_id: id,
          cost_center_id: optionalId,
          description: z.string().min(2).max(200),
          document_number: z.string().max(60).nullish(),
          issue_date: isoDate,
          due_date: isoDate,
          amount: positiveMoney,
          installments: z.coerce.number().int().min(1).max(120).default(1),
          notes: z.string().max(2000).nullish(),
        })
        .parse(req.body);
      if (b.due_date < b.issue_date) throw new HttpError(400, 'Vencimento não pode ser anterior à emissão');
      const ids = await withTransaction(async (c) => {
        const created = await createTitles(c, kind, b, req.user!.id);
        await audit(req, 'CRIAR', entity, created.join(','), b, c);
        return created;
      });
      res.status(201).json({ ids });
    }),
  );

  router.post(
    '/:id/pay',
    canWrite,
    ah(async (req, res) => {
      const tId = id.parse(req.params.id);
      const b = z
        .object({
          bank_account_id: id,
          payment_date: isoDate,
          amount: positiveMoney,
          interest: money.default(0),
          discount: money.default(0),
          notes: z.string().max(500).nullish(),
        })
        .parse(req.body);
      const result = await withTransaction(async (c) => {
        const [t] = await query('SELECT kind FROM financial_titles WHERE id = $1', [tId], c);
        if (!t || t.kind !== kind) throw new HttpError(404, 'Título não encontrado');
        const r = await payTitle(c, tId, b, req.user!.id);
        await audit(req, kind === 'PAGAR' ? 'PAGAR' : 'RECEBER', entity, tId, b, c);
        return r;
      });
      res.json(result);
    }),
  );

  router.post(
    '/:id/cancel',
    canWrite,
    ah(async (req, res) => {
      const tId = id.parse(req.params.id);
      await withTransaction(async (c) => {
        const [t] = await query('SELECT kind FROM financial_titles WHERE id = $1', [tId], c);
        if (!t || t.kind !== kind) throw new HttpError(404, 'Título não encontrado');
        await cancelTitle(c, tId, req.user!.id);
        await audit(req, 'CANCELAR', entity, tId, null, c);
      });
      res.json({ ok: true });
    }),
  );

  router.delete(
    '/payments/:paymentId',
    canWrite,
    ah(async (req, res) => {
      const pId = id.parse(req.params.paymentId);
      await withTransaction(async (c) => {
        await reversePayment(c, pId, req.user!.id);
        await audit(req, 'ESTORNAR_BAIXA', entity, pId, null, c);
      });
      res.status(204).end();
    }),
  );

  return router;
}
