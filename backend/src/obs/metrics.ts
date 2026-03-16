import { logger } from './logger.js';

export function recordRequestDuration(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  requestId?: string
) {
  logger.info('request', {
    method,
    path,
    statusCode,
    durationMs,
    requestId,
  });
}
