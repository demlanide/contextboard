import { Request, Response, NextFunction } from 'express';
import { uuidSchema } from '../../schemas/common.schemas.js';
import { successResponse, errorResponse } from '../../schemas/common.schemas.js';
import {
  CreateEdgeRequestSchema,
  UpdateEdgeRequestSchema,
} from '../../schemas/edge.schemas.js';
import {
  createEdge,
  updateEdge,
  deleteEdge,
} from '../../services/edges.service.js';

// POST /api/boards/:boardId/edges
export async function handleCreateEdge(req: Request, res: Response, next: NextFunction) {
  const boardIdResult = uuidSchema.safeParse(req.params['boardId']);
  if (!boardIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'boardId must be a valid UUID'));
  }
  try {
    const body = CreateEdgeRequestSchema.parse(req.body);
    const result = await createEdge(boardIdResult.data, body);
    return res.status(201).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/edges/:edgeId
export async function handleUpdateEdge(req: Request, res: Response, next: NextFunction) {
  const edgeIdResult = uuidSchema.safeParse(req.params['edgeId']);
  if (!edgeIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'edgeId must be a valid UUID'));
  }
  try {
    const body = UpdateEdgeRequestSchema.parse(req.body);
    const result = await updateEdge(edgeIdResult.data, body);
    return res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/edges/:edgeId
export async function handleDeleteEdge(req: Request, res: Response, next: NextFunction) {
  const edgeIdResult = uuidSchema.safeParse(req.params['edgeId']);
  if (!edgeIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'edgeId must be a valid UUID'));
  }
  try {
    const result = await deleteEdge(edgeIdResult.data);
    return res.status(200).json(
      successResponse({
        success: true,
        deletedEdgeId: result.deletedEdgeId,
        boardRevision: result.boardRevision,
      })
    );
  } catch (err) {
    next(err);
  }
}
