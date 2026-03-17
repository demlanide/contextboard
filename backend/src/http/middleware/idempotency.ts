import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { pool } from '../../db/pool.js';
import { findByScope, insertKey } from '../../repos/idempotency.repo.js';
import { errorResponse } from '../../schemas/common.schemas.js';

function fingerprint(body: unknown): string {
  const normalized = JSON.stringify(body ?? {});
  return createHash('sha256').update(normalized).digest('hex');
}

function buildScopeKey(operation: string, boardId: string | undefined, key: string): string {
  return `${operation}:${boardId ?? 'global'}:${key}`;
}

export function idempotencyMiddleware(operation: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rawKey = req.headers['idempotency-key'];
    const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;
    if (!idempotencyKey) {
      return next();
    }

    const boardIdParam = req.params['boardId'];
    const boardId = typeof boardIdParam === 'string' ? boardIdParam : boardIdParam?.[0];
    const scopeKey = buildScopeKey(operation, boardId, idempotencyKey);
    const fp = fingerprint(req.body);

    const client = await pool.connect();
    try {
      const existing = await findByScope(client, scopeKey);

      if (existing) {
        if (existing.requestFingerprint !== fp) {
          return res.status(409).json(
            errorResponse('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload')
          );
        }
        // Replay cached response
        return res
          .status(existing.responseStatusCode)
          .json(existing.responseBody);
      }

      // Store original response by intercepting json()
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        // Cache after sending
        insertKey(client, {
          scopeKey,
          requestFingerprint: fp,
          responseStatusCode: res.statusCode,
          responseBody: body,
        })
          .catch(() => {/* non-critical */})
          .finally(() => client.release());
        return originalJson(body);
      };

      next();
    } catch (err) {
      client.release();
      next(err);
    }
  };
}
