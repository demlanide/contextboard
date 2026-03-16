import express from 'express';
import { router } from '../http/router.js';
import { requestIdMiddleware } from '../http/middleware/request-id.js';
import { errorHandler } from '../http/middleware/error-handler.js';
import { recordRequestDuration } from '../obs/metrics.js';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);

  // Request duration logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      recordRequestDuration(
        req.method,
        req.path,
        res.statusCode,
        Date.now() - start,
        res.getHeader('X-Request-Id') as string | undefined
      );
    });
    next();
  });

  app.use('/api', router);

  app.use(errorHandler);

  return app;
}
