import type { Request } from 'express';
import { query, type Db, pool } from '../db/pool.js';

export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string | number | null,
  details?: unknown,
  db: Db = pool,
) {
  await query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      req.user?.id ?? null,
      action,
      entity,
      entityId != null ? String(entityId) : null,
      details ? JSON.stringify(details) : null,
      req.ip ?? null,
    ],
    db,
  );
}
