import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  CreateBoardRequestSchema,
  UpdateBoardRequestSchema,
} from '../../schemas/board.schemas.js';
import { uuidSchema } from '../../schemas/common.schemas.js';
import { successResponse, errorResponse } from '../../schemas/common.schemas.js';
import {
  createBoard,
  listBoards,
  getBoard,
  updateBoard,
  deleteBoard,
} from '../../services/boards.service.js';

function parseBoardId(req: Request, res: Response): string | null {
  const result = uuidSchema.safeParse(req.params['boardId']);
  if (!result.success) {
    res.status(422).json(errorResponse('VALIDATION_ERROR', 'boardId must be a valid UUID'));
    return null;
  }
  return result.data;
}

// POST /api/boards
export async function handleCreateBoard(req: Request, res: Response, next: NextFunction) {
  try {
    const body = CreateBoardRequestSchema.parse(req.body);
    const result = await createBoard(body);
    return res.status(201).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

// GET /api/boards
export async function handleListBoards(req: Request, res: Response, next: NextFunction) {
  try {
    const boards = await listBoards();
    return res.status(200).json(successResponse({ boards }));
  } catch (err) {
    next(err);
  }
}

// GET /api/boards/:boardId
export async function handleGetBoard(req: Request, res: Response, next: NextFunction) {
  const boardId = parseBoardId(req, res);
  if (!boardId) return;
  try {
    const board = await getBoard(boardId);
    return res.status(200).json(successResponse({ board }));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/boards/:boardId
export async function handleUpdateBoard(req: Request, res: Response, next: NextFunction) {
  const boardId = parseBoardId(req, res);
  if (!boardId) return;
  try {
    const patch = UpdateBoardRequestSchema.parse(req.body);
    const board = await updateBoard(boardId, patch);
    return res.status(200).json(successResponse({ board }));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/boards/:boardId
export async function handleDeleteBoard(req: Request, res: Response, next: NextFunction) {
  const boardId = parseBoardId(req, res);
  if (!boardId) return;
  try {
    const result = await deleteBoard(boardId);
    return res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}
