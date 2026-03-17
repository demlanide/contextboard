import { Router } from 'express';
import { idempotencyMiddleware } from './middleware/idempotency.js';
import { requireMergePatch } from './middleware/content-type.js';
import {
  handleCreateBoard,
  handleListBoards,
  handleGetBoard,
  handleUpdateBoard,
  handleDeleteBoard,
} from './controllers/boards.controller.js';
import { handleGetBoardState } from './controllers/board-state.controller.js';
import {
  handleCreateNode,
  handleUpdateNode,
  handleDeleteNode,
} from './controllers/nodes.controller.js';

const router = Router();

// US1: Create Board
router.post('/boards', idempotencyMiddleware('create_board'), handleCreateBoard);

// US2: List Boards
router.get('/boards', handleListBoards);

// S2: Get Board State (hydration)
router.get('/boards/:boardId/state', handleGetBoardState);

// US3: Get Board
router.get('/boards/:boardId', handleGetBoard);

// US4 + US6: Update Board (metadata + archive)
router.patch(
  '/boards/:boardId',
  requireMergePatch,
  idempotencyMiddleware('update_board'),
  handleUpdateBoard
);

// US5: Delete Board
router.delete('/boards/:boardId', handleDeleteBoard);

// S5: Node CRUD
router.post(
  '/boards/:boardId/nodes',
  idempotencyMiddleware('create_node'),
  handleCreateNode
);

router.patch(
  '/nodes/:nodeId',
  requireMergePatch,
  idempotencyMiddleware('update_node'),
  handleUpdateNode
);

router.delete('/nodes/:nodeId', handleDeleteNode);

export { router };
