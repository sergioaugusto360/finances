import { z } from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
export const money = z.coerce.number().finite().nonnegative().max(999_999_999_999);
export const positiveMoney = z.coerce.number().finite().positive('Valor deve ser maior que zero').max(999_999_999_999);
export const optionalId = z.coerce.number().int().positive().nullish();
export const id = z.coerce.number().int().positive();

export const strongPassword = z
  .string()
  .min(8, 'Mínimo de 8 caracteres')
  .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula')
  .regex(/[a-z]/, 'Inclua ao menos uma letra minúscula')
  .regex(/\d/, 'Inclua ao menos um número');

export const periodQuery = z.object({
  start: isoDate,
  end: isoDate,
  cost_center_id: optionalId,
  bank_account_id: optionalId,
});
