import { Request, Response, NextFunction } from 'express';
import { uuidSchema } from '../../schemas/common.schemas.js';
import { successResponse, errorResponse } from '../../schemas/common.schemas.js';
import {
  CreateNodeRequestSchema,
  UpdateNodeRequestSchema,
} from '../../schemas/node.schemas.js';
import {
  createNode,
  updateNode,
  deleteNode,
} from '../../services/nodes.service.js';

// POST /api/boards/:boardId/nodes
export async function handleCreateNode(req: Request, res: Response, next: NextFunction) {
  const boardIdResult = uuidSchema.safeParse(req.params['boardId']);
  if (!boardIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'boardId must be a valid UUID'));
  }
  try {
    const body = CreateNodeRequestSchema.parse(req.body);
    const result = await createNode(boardIdResult.data, body);
    return res.status(201).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/nodes/:nodeId
export async function handleUpdateNode(req: Request, res: Response, next: NextFunction) {
  const nodeIdResult = uuidSchema.safeParse(req.params['nodeId']);
  if (!nodeIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'nodeId must be a valid UUID'));
  }
  try {
    const body = UpdateNodeRequestSchema.parse(req.body);
    const result = await updateNode(nodeIdResult.data, body);
    return res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/nodes/:nodeId
export async function handleDeleteNode(req: Request, res: Response, next: NextFunction) {
  const nodeIdResult = uuidSchema.safeParse(req.params['nodeId']);
  if (!nodeIdResult.success) {
    return res.status(422).json(errorResponse('VALIDATION_ERROR', 'nodeId must be a valid UUID'));
  }
  try {
    const result = await deleteNode(nodeIdResult.data);
    return res.status(200).json(
      successResponse({
        success: true,
        deletedNodeId: result.deletedNodeId,
        deletedEdgeIds: result.deletedEdgeIds,
        boardRevision: result.boardRevision,
      })
    );
  } catch (err) {
    next(err);
  }
}
