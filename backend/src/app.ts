import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import registryRoutes from './routes/registry.js';
import financeRoutes from './routes/finance.js';
import { titlesRouter } from './routes/titles.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payables', titlesRouter('PAGAR'));
app.use('/api/receivables', titlesRouter('RECEBER'));
app.use('/api', registryRoutes);
app.use('/api', financeRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use(errorHandler);
