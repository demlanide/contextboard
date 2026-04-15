import { Request, Response, NextFunction } from 'express';
import { uuidSchema } from '../../schemas/common.schemas.js';
import { successResponse, errorResponse } from '../../schemas/common.schemas.js';
import { GetOperationsQuerySchema } from '../../schemas/operations.schemas.js';
import {
  getOperationsAfterRevision,
  OperationsBoardNotFoundError,
  CursorInvalidError,
} from '../../services/operations.service.js';
import { logger } from '../../obs/logger.js';

// GET /api/boards/:boardId/operations
export async function handleGetBoardOperations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const boardIdResult = uuidSchema.safeParse(req.params['boardId']);
  if (!boardIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'boardId must be a valid UUID'));
  }
  const boardId = boardIdResult.data;

  const queryResult = GetOperationsQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    const firstIssue = queryResult.error.issues[0];
    return res.status(400).json(
      errorResponse('VALIDATION_ERROR', firstIssue?.message ?? 'Invalid query parameters', {
        field: String(firstIssue?.path?.[0] ?? ''),
      })
    );
  }

  const { afterRevision, limit } = queryResult.data;
  const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';
  const startMs = Date.now();

  logger.debug('Operations polling request received', { boardId, afterRevision, limit, requestId });

  try {
    const result = await getOperationsAfterRevision(boardId, afterRevision, limit);

    const durationMs = Date.now() - startMs;

    if (result.operations.length === 0) {
      logger.debug('Operations polling: caught up', {
        boardId,
        afterRevision,
        headRevision: result.headRevision,
        requestId,
      });
    } else {
      logger.info('Operations polling: returned operations', {
        boardId,
        afterRevision,
        count: result.operations.length,
        headRevision: result.headRevision,
        durationMs,
        requestId,
      });
    }

    return res.status(200).json(successResponse(result));
  } catch (err) {
    if (err instanceof OperationsBoardNotFoundError) {
      logger.info('Operations polling: board not found', { boardId, requestId });
      return res.status(404).json(errorResponse('BOARD_NOT_FOUND', 'Board not found'));
    }
    if (err instanceof CursorInvalidError) {
      logger.warn('Operations polling: stale cursor', {
        boardId,
        afterRevision,
        minSafeRevision: err.minSafeRevision,
        requestId,
      });
      return res.status(410).json(
        errorResponse('CURSOR_INVALID', err.message, { minSafeRevision: err.minSafeRevision })
      );
    }
    logger.error('Operations polling: unexpected error', {
      boardId,
      afterRevision,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      requestId,
    });
    next(err);
  }
}
