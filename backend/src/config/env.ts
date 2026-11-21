import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter ao menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_NAME: z.string().default('Administrador'),
  ADMIN_EMAIL: z.string().email().default('admin@financas.local'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin@12345'),
});

export const env = schema.parse(process.env);
