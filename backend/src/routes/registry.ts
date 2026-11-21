/** Cadastros / gestão complementar: plano de contas, centros de custo, parceiros, orçamento. */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { ah, HttpError } from '../middleware/errors.js';
import { authenticate, canWrite } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { id, money } from './schemas.js';

const router = Router();
router.use(authenticate);

// ---------- Plano de contas ----------
const accountTypes = z.enum(['ATIVO', 'PASSIVO', 'PATRIMONIO', 'RECEITA', 'DEDUCAO', 'CUSTO', 'DESPESA']);
const dreGroups = z.enum([
  'RECEITA_BRUTA', 'DEDUCOES', 'CUSTOS', 'DESPESAS_OPERACIONAIS',
  'DEPRECIACAO', 'RECEITAS_FINANCEIRAS', 'DESPESAS_FINANCEIRAS', 'IMPOSTOS_LUCRO',
]);

router.get(
  '/accounts',
  ah(async (req, res) => {
    const { type } = z.object({ type: z.string().optional() }).parse(req.query);
    const types = type ? type.split(',') : null;
    res.json(
      await query(
        `SELECT a.*, p.code AS parent_code,
                EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.account_id = a.id) AS has_entries
           FROM accounts a LEFT JOIN accounts p ON p.id = a.parent_id
          WHERE ($1::text[] IS NULL OR a.type = ANY($1))
          ORDER BY string_to_array(a.code, '.')::int[]`,
        [types],
      ),
    );
  }),
);

const accountBody = z.object({
  code: z.string().regex(/^\d+(\.\d+)*$/, 'Código no formato 1.2.3'),
  name: z.string().min(2).max(120),
  type: accountTypes,
  subtype: z.enum(['CIRCULANTE', 'NAO_CIRCULANTE']).nullish(),
  dre_group: dreGroups.nullish(),
  accepts_entries: z.boolean().default(true),
  active: z.boolean().default(true),
});

function checkAccountRules(b: z.infer<typeof accountBody>) {
  const resultType = ['RECEITA', 'DEDUCAO', 'CUSTO', 'DESPESA'].includes(b.type);
  if (resultType && b.accepts_entries && !b.dre_group) throw new HttpError(400, 'Contas de resultado analíticas exigem o grupo da DRE');
  if (!resultType && b.dre_group) throw new HttpError(400, 'Contas patrimoniais não possuem grupo da DRE');
  if (['ATIVO', 'PASSIVO'].includes(b.type) && !b.subtype) throw new HttpError(400, 'Informe se a conta é circulante ou não circulante');
}

router.post(
  '/accounts',
  canWrite,
  ah(async (req, res) => {
    const b = accountBody.parse(req.body);
    checkAccountRules(b);
    const parentCode = b.code.includes('.') ? b.code.replace(/\.[^.]+$/, '') : null;
    let parentId: number | null = null;
    if (parentCode) {
      const [p] = await query<{ id: number; type: string }>('SELECT id, type FROM accounts WHERE code = $1', [parentCode]);
      if (!p) throw new HttpError(400, `Conta pai ${parentCode} não existe`);
      if (p.type !== b.type) throw new HttpError(400, 'A conta deve ter o mesmo tipo da conta pai');
      parentId = p.id;
    }
    const [a] = await query(
      `INSERT INTO accounts (code, name, type, subtype, dre_group, parent_id, accepts_entries, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.code, b.name, b.type, b.subtype ?? null, b.dre_group ?? null, parentId, b.accepts_entries, b.active],
    );
    await audit(req, 'CRIAR', 'accounts', a.id, b);
    res.status(201).json(a);
  }),
);

router.put(
  '/accounts/:id',
  canWrite,
  ah(async (req, res) => {
    const accId = id.parse(req.params.id);
    const b = accountBody.omit({ code: true, type: true }).parse(req.body);
    const [cur] = await query('SELECT * FROM accounts WHERE id = $1', [accId]);
    if (!cur) throw new HttpError(404, 'Conta não encontrada');
    checkAccountRules({ ...b, code: cur.code, type: cur.type });
    if (cur.system_key && !b.active) throw new HttpError(400, 'Contas do sistema não podem ser inativadas');
    await query(
      'UPDATE accounts SET name=$1, subtype=$2, dre_group=$3, accepts_entries=$4, active=$5 WHERE id=$6',
      [b.name, b.subtype ?? null, b.dre_group ?? null, b.accepts_entries, b.active, accId],
    );
    await audit(req, 'ALTERAR', 'accounts', accId, b);
    res.json({ ok: true });
  }),
);

router.delete(
  '/accounts/:id',
  canWrite,
  ah(async (req, res) => {
    const accId = id.parse(req.params.id);
    const [cur] = await query('SELECT system_key FROM accounts WHERE id = $1', [accId]);
    if (!cur) throw new HttpError(404, 'Conta não encontrada');
    if (cur.system_key) throw new HttpError(400, 'Contas do sistema não podem ser excluídas');
    await query('DELETE FROM accounts WHERE id = $1', [accId]); // FK impede se houver lançamentos/filhas
    await audit(req, 'EXCLUIR', 'accounts', accId);
    res.status(204).end();
  }),
);

// ---------- Centros de custo ----------
const ccBody = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), active: z.boolean().default(true) });

router.get('/cost-centers', ah(async (_req, res) => res.json(await query('SELECT * FROM cost_centers ORDER BY code'))));
router.post(
  '/cost-centers',
  canWrite,
  ah(async (req, res) => {
    const b = ccBody.parse(req.body);
    const [c] = await query('INSERT INTO cost_centers (code, name, active) VALUES ($1,$2,$3) RETURNING *', [b.code.toUpperCase(), b.name, b.active]);
    await audit(req, 'CRIAR', 'cost_centers', c.id, b);
    res.status(201).json(c);
  }),
);
router.put(
  '/cost-centers/:id',
  canWrite,
  ah(async (req, res) => {
    const ccId = id.parse(req.params.id);
    const b = ccBody.parse(req.body);
    await query('UPDATE cost_centers SET code=$1, name=$2, active=$3 WHERE id=$4', [b.code.toUpperCase(), b.name, b.active, ccId]);
    await audit(req, 'ALTERAR', 'cost_centers', ccId, b);
    res.json({ ok: true });
  }),
);

// ---------- Clientes e fornecedores ----------
const partnerBody = z.object({
  kind: z.enum(['CLIENTE', 'FORNECEDOR', 'AMBOS']),
  name: z.string().min(2).max(160),
  document: z.string().max(20).nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  phone: z.string().max(30).nullish(),
  active: z.boolean().default(true),
});

router.get(
  '/partners',
  ah(async (req, res) => {
    const { kind, search } = z.object({ kind: z.enum(['CLIENTE', 'FORNECEDOR']).optional(), search: z.string().optional() }).parse(req.query);
    res.json(
      await query(
        `SELECT * FROM partners
          WHERE ($1::text IS NULL OR kind = $1 OR kind = 'AMBOS')
            AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR document ILIKE '%' || $2 || '%')
          ORDER BY name`,
        [kind ?? null, search || null],
      ),
    );
  }),
);
router.post(
  '/partners',
  canWrite,
  ah(async (req, res) => {
    const b = partnerBody.parse(req.body);
    const [p] = await query(
      'INSERT INTO partners (kind, name, document, email, phone, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [b.kind, b.name, b.document || null, b.email || null, b.phone || null, b.active],
    );
    await audit(req, 'CRIAR', 'partners', p.id, b);
    res.status(201).json(p);
  }),
);
router.put(
  '/partners/:id',
  canWrite,
  ah(async (req, res) => {
    const pId = id.parse(req.params.id);
    const b = partnerBody.parse(req.body);
    await query('UPDATE partners SET kind=$1, name=$2, document=$3, email=$4, phone=$5, active=$6 WHERE id=$7', [
      b.kind, b.name, b.document || null, b.email || null, b.phone || null, b.active, pId,
    ]);
    await audit(req, 'ALTERAR', 'partners', pId, b);
    res.json({ ok: true });
  }),
);

// ---------- Orçamento ----------
router.get(
  '/budgets',
  ah(async (req, res) => {
    const { year } = z.object({ year: z.coerce.number().int() }).parse(req.query);
    res.json(
      await query(
        `SELECT b.*, a.code, a.name FROM budgets b JOIN accounts a ON a.id = b.account_id
          WHERE b.year = $1 ORDER BY string_to_array(a.code, '.')::int[], b.month`,
        [year],
      ),
    );
  }),
);
router.put(
  '/budgets',
  canWrite,
  ah(async (req, res) => {
    const b = z
      .object({
        account_id: id,
        year: z.number().int().min(2000).max(2100),
        months: z.array(z.object({ month: z.number().int().min(1).max(12), amount: money })).min(1).max(12),
      })
      .parse(req.body);
    const [acc] = await query('SELECT dre_group FROM accounts WHERE id = $1', [b.account_id]);
    if (!acc?.dre_group) throw new HttpError(400, 'Orçamento só pode ser definido para contas de resultado');
    for (const m of b.months) {
      await query(
        `INSERT INTO budgets (account_id, year, month, amount) VALUES ($1,$2,$3,$4)
         ON CONFLICT (account_id, year, month) DO UPDATE SET amount = EXCLUDED.amount`,
        [b.account_id, b.year, m.month, m.amount],
      );
    }
    await audit(req, 'ALTERAR', 'budgets', b.account_id, b);
    res.json({ ok: true });
  }),
);
router.delete(
  '/budgets/:accountId/:year',
  canWrite,
  ah(async (req, res) => {
    const accId = id.parse(req.params.accountId);
    const year = id.parse(req.params.year);
    await query('DELETE FROM budgets WHERE account_id = $1 AND year = $2', [accId, year]);
    await audit(req, 'EXCLUIR', 'budgets', accId, { year });
    res.status(204).end();
  }),
);

export default router;
