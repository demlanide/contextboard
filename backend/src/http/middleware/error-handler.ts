import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { BoardError, BoardNotFoundError } from '../../domain/validation/board-rules.js';
import { NodeError, NodeNotFoundError, NodeLockedError } from '../../domain/validation/node-rules.js';
import { EdgeError, EdgeNotFoundError, InvalidEdgeReferenceError } from '../../domain/validation/edge-rules.js';
import { errorResponse } from '../../schemas/common.schemas.js';
import { logger } from '../../obs/logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Node errors (before generic BoardError catch)
  if (err instanceof NodeNotFoundError) {
    return res.status(404).json(errorResponse(err.code, err.message));
  }

  if (err instanceof NodeLockedError) {
    return res.status(409).json(errorResponse(err.code, err.message));
  }

  if (err instanceof NodeError) {
    return res.status(422).json(errorResponse(err.code, err.message));
  }

  // Edge errors
  if (err instanceof EdgeNotFoundError) {
    return res.status(404).json(errorResponse(err.code, err.message));
  }

  if (err instanceof InvalidEdgeReferenceError) {
    return res.status(422).json(errorResponse(err.code, err.message));
  }

  if (err instanceof EdgeError) {
    return res.status(422).json(errorResponse(err.code, err.message));
  }

  // Board errors
  if (err instanceof BoardNotFoundError) {
    return res.status(404).json(errorResponse(err.code, err.message));
  }

  if (err instanceof BoardError) {
    // Archived board errors should return 409 Conflict
    if (err.message === 'Archived boards are read-only') {
      return res.status(409).json(errorResponse(err.code, err.message));
    }
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
