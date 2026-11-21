import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { ah, HttpError } from '../middleware/errors.js';
import { authenticate, signToken, type Role } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { strongPassword } from './schemas.js';

const router = Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('senha-inexistente', 12);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

router.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const [user] = await query<{
      id: number; name: string; email: string; role: Role; password_hash: string;
      active: boolean; failed_attempts: number; locked_until: Date | null;
    }>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);

    // Mensagem genérica para não revelar se o e-mail existe
    const invalid = new HttpError(401, 'E-mail ou senha inválidos');
    if (!user || !user.active) {
      await bcrypt.compare(password, DUMMY_HASH); // mantém tempo de resposta constante
      throw invalid;
    }
    if (user.locked_until && user.locked_until > new Date()) {
      throw new HttpError(423, `Usuário bloqueado temporariamente por excesso de tentativas. Tente após ${LOCK_MINUTES} minutos.`);
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const attempts = user.failed_attempts + 1;
      await query(
        `UPDATE users SET failed_attempts = $1::int,
                locked_until = CASE WHEN $1::int >= $2::int THEN NOW() + make_interval(mins => $3::int) ELSE NULL END
          WHERE id = $4`,
        [attempts, MAX_ATTEMPTS, LOCK_MINUTES, user.id],
      );
      req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      await audit(req, 'LOGIN_FALHA', 'users', user.id, { attempts });
      throw invalid;
    }

    await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1', [user.id]);
    const authUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    req.user = authUser;
    await audit(req, 'LOGIN', 'users', user.id);
    res.json({ token: signToken(authUser), user: authUser });
  }),
);

router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

router.post(
  '/change-password',
  authenticate,
  ah(async (req, res) => {
    const body = z.object({ current_password: z.string(), new_password: strongPassword }).parse(req.body);
    const [u] = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!(await bcrypt.compare(body.current_password, u.password_hash))) throw new HttpError(400, 'Senha atual incorreta');
    const hash = await bcrypt.hash(body.new_password, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user!.id]);
    await audit(req, 'ALTERAR_SENHA', 'users', req.user!.id);
    res.json({ ok: true });
  }),
);

export default router;
