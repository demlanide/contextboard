import { Request, Response, NextFunction } from 'express';
import { uuidSchema, successResponse, errorResponse } from '../../schemas/common.schemas.js';
import { SendMessageRequestSchema } from '../../schemas/chat.schemas.js';
import { getChatHistory, sendMessage } from '../../services/chat.service.js';

function parseBoardId(req: Request, res: Response): string | null {
  const result = uuidSchema.safeParse(req.params['boardId']);
  if (!result.success) {
    res.status(422).json(errorResponse('VALIDATION_ERROR', 'boardId must be a valid UUID'));
    return null;
  }
  return result.data;
}

// GET /api/boards/:boardId/chat
export async function handleGetChat(req: Request, res: Response, next: NextFunction) {
  const boardId = parseBoardId(req, res);
  if (!boardId) return;
  try {
    const result = await getChatHistory(boardId);
    return res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

// POST /api/boards/:boardId/chat/messages
export async function handleSendMessage(req: Request, res: Response, next: NextFunction) {
  const boardId = parseBoardId(req, res);
  if (!boardId) return;
  try {
    const body = SendMessageRequestSchema.parse(req.body);
    const result = await sendMessage(boardId, body);

    // If agent failed, include error in envelope per contract
    if (result.agentMessage === null) {
      return res.status(200).json({
        data: result,
        error: {
          code: 'AGENT_UNAVAILABLE',
          message: 'The assistant could not generate a response. Your message has been saved.',
          details: {},
        },
      });
    }

    return res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
}
