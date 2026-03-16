import { Request, Response, NextFunction } from 'express';
import { uuidSchema } from '../../schemas/common.schemas.js';
import { successResponse, errorResponse } from '../../schemas/common.schemas.js';
import { getBoardState } from '../../services/board-state.service.js';

// GET /api/boards/:boardId/state
export async function handleGetBoardState(req: Request, res: Response, next: NextFunction) {
  const result = uuidSchema.safeParse(req.params['boardId']);
  if (!result.success) {
    return res.status(400).json(
      errorResponse('VALIDATION_ERROR', 'Invalid board ID format', {
        boardId: req.params['boardId'],
      })
    );
  }

  try {
    const state = await getBoardState(result.data);
    return res.status(200).json(successResponse(state));
  } catch (err) {
    next(err);
  }
}
