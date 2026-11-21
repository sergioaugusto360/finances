import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Envolve handlers assíncronos para que erros cheguem ao errorHandler. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  const pgErr = err as { code?: string; detail?: string };
  if (pgErr?.code === '23505') return res.status(409).json({ error: 'Registro duplicado', details: pgErr.detail });
  if (pgErr?.code === '23503') return res.status(409).json({ error: 'Registro vinculado a outros dados', details: pgErr.detail });
  if (pgErr?.code === '23514') return res.status(400).json({ error: 'Valor fora das regras permitidas', details: pgErr.detail });

  console.error(err);
  return res.status(500).json({ error: 'Erro interno do servidor' });
}
