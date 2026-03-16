import { createApp } from './app.js';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { logger } from '../obs/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info('Server started', { port: env.PORT });
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await pool.end();
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
