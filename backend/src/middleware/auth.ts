import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { HttpError } from './errors.js';

export type Role = 'admin' | 'financeiro' | 'visualizador';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Valida o JWT e confirma no banco que o usuário continua ativo. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Não autenticado');

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, 'Sessão expirada ou inválida');
    }

    const [user] = await query<AuthUser & { active: boolean }>(
      'SELECT id, name, email, role, active FROM users WHERE id = $1',
      [Number(payload.sub)],
    );
    if (!user || !user.active) throw new HttpError(401, 'Usuário inativo');
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

/** Controle de acesso por perfil (RBAC). */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Não autenticado'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Acesso negado para o seu perfil'));
    next();
  };

/** Perfis que podem alterar dados financeiros. */
export const canWrite = authorize('admin', 'financeiro');
export const adminOnly = authorize('admin');
