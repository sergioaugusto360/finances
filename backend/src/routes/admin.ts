import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { ah, HttpError } from '../middleware/errors.js';
import { adminOnly, authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { id, strongPassword } from './schemas.js';

const router = Router();
router.use(authenticate);

const roleEnum = z.enum(['admin', 'financeiro', 'visualizador']);

// ---------- Usuários ----------
router.get(
  '/users',
  adminOnly,
  ah(async (_req, res) => {
    res.json(
      await query(
        `SELECT id, name, email, role, active, last_login_at, created_at,
                (locked_until IS NOT NULL AND locked_until > NOW()) AS locked
           FROM users ORDER BY name`,
      ),
    );
  }),
);

router.post(
  '/users',
  adminOnly,
  ah(async (req, res) => {
    const body = z
      .object({ name: z.string().min(2).max(120), email: z.string().email(), role: roleEnum, password: strongPassword })
      .parse(req.body);
    const hash = await bcrypt.hash(body.password, 12);
    const [u] = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, lower($2), $3, $4)
       RETURNING id, name, email, role, active`,
      [body.name, body.email, hash, body.role],
    );
    await audit(req, 'CRIAR', 'users', u.id, { email: body.email, role: body.role });
    res.status(201).json(u);
  }),
);

router.put(
  '/users/:id',
  adminOnly,
  ah(async (req, res) => {
    const userId = id.parse(req.params.id);
    const body = z
      .object({ name: z.string().min(2).max(120), role: roleEnum, active: z.boolean(), password: strongPassword.optional().or(z.literal('')) })
      .parse(req.body);
    if (userId === req.user!.id && (!body.active || body.role !== 'admin')) {
      throw new HttpError(400, 'Você não pode remover seu próprio acesso de administrador');
    }
    await query(
      `UPDATE users SET name = $1, role = $2, active = $3, updated_at = NOW(),
              failed_attempts = 0, locked_until = NULL WHERE id = $4`,
      [body.name, body.role, body.active, userId],
    );
    if (body.password) {
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(body.password, 12), userId]);
    }
    await audit(req, 'ALTERAR', 'users', userId, { role: body.role, active: body.active, senha_redefinida: !!body.password });
    res.json({ ok: true });
  }),
);

// ---------- Auditoria ----------
router.get(
  '/audit',
  adminOnly,
  ah(async (req, res) => {
    const q = z
      .object({ entity: z.string().optional(), user_id: z.coerce.number().optional(), limit: z.coerce.number().max(1000).default(200) })
      .parse(req.query);
    res.json(
      await query(
        `SELECT l.id, l.action, l.entity, l.entity_id, l.details, l.ip, l.created_at, u.name AS user_name
           FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
          WHERE ($1::text IS NULL OR l.entity = $1) AND ($2::int IS NULL OR l.user_id = $2)
          ORDER BY l.created_at DESC LIMIT $3`,
        [q.entity ?? null, q.user_id ?? null, q.limit],
      ),
    );
  }),
);

// ---------- Configurações da empresa ----------
router.get(
  '/settings',
  ah(async (_req, res) => {
    const [s] = await query('SELECT * FROM company_settings WHERE id = 1');
    res.json(s);
  }),
);

router.put(
  '/settings',
  adminOnly,
  ah(async (req, res) => {
    const body = z
      .object({ company_name: z.string().min(2).max(160), document: z.string().max(20).nullish(), fiscal_year_start_month: z.number().int().min(1).max(12) })
      .parse(req.body);
    await query(
      'UPDATE company_settings SET company_name = $1, document = $2, fiscal_year_start_month = $3, updated_at = NOW() WHERE id = 1',
      [body.company_name, body.document ?? null, body.fiscal_year_start_month],
    );
    await audit(req, 'ALTERAR', 'company_settings', 1, body);
    res.json({ ok: true });
  }),
);

export default router;
