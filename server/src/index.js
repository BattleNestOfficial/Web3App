import { app } from './app.js';
import { pool, initDb } from './config/db.js';
import { env } from './config/env.js';

async function start() {
  try {
    await initDb();

    const server = app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`API listening on http://localhost:${env.port}`);
    });

    const shutdown = async () => {
      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

