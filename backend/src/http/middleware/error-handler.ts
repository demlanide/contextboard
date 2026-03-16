import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { BoardError, BoardNotFoundError } from '../../domain/validation/board-rules.js';
import { errorResponse } from '../../schemas/common.schemas.js';
import { logger } from '../../obs/logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof BoardNotFoundError) {
    return res.status(404).json(errorResponse(err.code, err.message));
  }

  if (err instanceof BoardError) {
    return res.status(422).json(errorResponse(err.code, err.message));
  }

  if (err instanceof ZodError) {
    return res.status(422).json(
      errorResponse('VALIDATION_ERROR', 'Invalid request', {
        issues: err.issues,
      })
    );
  }

  // Unknown error
  logger.error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json(errorResponse('INTERNAL_ERROR', 'Internal server error'));
}
