// T013: Agent controller
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { uuidSchema, errorResponse } from '../../schemas/common.schemas.js';
import { AgentActionsRequestSchema, ApplyRequestSchema } from '../../schemas/agent.schemas.js';
import { successResponse } from '../../schemas/common.schemas.js';
import * as agentService from '../../services/agent.service.js';
import { applyActionPlan, ApplyError } from '../../services/agent-apply.service.js';
import { logger } from '../../obs/logger.js';

export async function suggestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const boardId = uuidSchema.parse(req.params.boardId);
    const body = AgentActionsRequestSchema.parse(req.body);

    if (body.mode !== 'suggest') {
      return res.status(422).json({
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Only mode "suggest" is supported in this version',
          details: {},
        },
      });
    }

    const requestId = uuidv4();
    const result = await agentService.suggest(
      boardId,
      body.prompt,
      body.selectionContext as {
        selectedNodeIds?: string[];
        selectedEdgeIds?: string[];
        viewport?: { x: number; y: number; zoom: number };
      } | undefined,
      requestId,
      body.images
    );

    // Return 200 even on agent errors (per contract)
    const response = {
      data: {
        message: result.message,
        actionPlan: result.actionPlan,
        preview: result.preview,
      },
      error: result.error ?? null,
    };

    return res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function applyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const boardId = uuidSchema.parse(req.params.boardId);
    const body = ApplyRequestSchema.parse(req.body);

    const result = await applyActionPlan(boardId, body.actionPlan);

    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof ApplyError) {
      logger.warn('Apply rejected', {
        code: err.code,
        message: err.message,
        details: err.details,
        boardId: req.params.boardId,
      });

      const statusMap: Record<string, number> = {
        LOCKED_NODE: 409,
        ACTION_PLAN_INVALID: 422,
        ACTION_PLAN_TOO_LARGE: 413,
      };
      const status = statusMap[err.code] ?? 422;

      return res.status(status).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }
    next(err);
  }
}
