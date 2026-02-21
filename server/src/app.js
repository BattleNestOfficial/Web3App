import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const bootedAt = Date.now();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  res.json({
    service: 'crimson-console-backend',
    status: 'ok',
    apiBase: '/api',
    health: '/health',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSec: Math.floor((Date.now() - bootedAt) / 1000),
    timestamp: new Date().toISOString()
  });
});

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
