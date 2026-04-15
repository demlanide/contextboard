import { Router, type Router as RouterType } from 'express';
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
  handleBatchNodeMutations,
} from './controllers/nodes.controller.js';
import {
  handleCreateEdge,
  handleUpdateEdge,
  handleDeleteEdge,
} from './controllers/edges.controller.js';
import { handleGetChat, handleSendMessage } from './controllers/chat.controller.js';
import { suggestHandler, applyHandler } from './controllers/agent.controller.js';
import { handleGetBoardOperations } from './controllers/operations.controller.js';
import { rateLimit } from './middleware/rate-limit.js';
import { env } from '../config/env.js';
import {
  handleUploadAsset,
  handleGetAssetMetadata,
  handleGetAssetFile,
  handleGetAssetThumbnail,
} from './controllers/assets.controller.js';
import { uploadMiddleware } from './middleware/upload.js';

const router: RouterType = Router();

// US1: Create Board
router.post('/boards', idempotencyMiddleware('create_board'), handleCreateBoard);

// US2: List Boards
router.get('/boards', handleListBoards);

// S10: Agent suggest
router.post('/boards/:boardId/agent/actions', rateLimit(env.SUGGEST_RATE_LIMIT), suggestHandler);

// S11: Agent apply
router.post('/boards/:boardId/agent/actions/apply', rateLimit(env.APPLY_RATE_LIMIT), applyHandler);

// S9: Chat
router.get('/boards/:boardId/chat', handleGetChat);
router.post('/boards/:boardId/chat/messages', handleSendMessage);

// S2: Get Board State (hydration)
router.get('/boards/:boardId/state', handleGetBoardState);

// S12: Operations polling
router.get('/boards/:boardId/operations', rateLimit(120), handleGetBoardOperations);

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

// S7: Batch Node Mutations
router.post(
  '/boards/:boardId/nodes/batch',
  idempotencyMiddleware('batch_node_mutations'),
  handleBatchNodeMutations
);

// S6: Edge CRUD
router.post(
  '/boards/:boardId/edges',
  idempotencyMiddleware('create_edge'),
  handleCreateEdge
);

router.patch(
  '/edges/:edgeId',
  requireMergePatch,
  idempotencyMiddleware('update_edge'),
  handleUpdateEdge
);

router.delete('/edges/:edgeId', handleDeleteEdge);

// S8: Asset CRUD
router.post(
  '/assets/upload',
  uploadMiddleware,
  idempotencyMiddleware('create_asset'),
  handleUploadAsset
);
router.get('/assets/:assetId', handleGetAssetMetadata);
router.get('/assets/:assetId/file', handleGetAssetFile);
router.get('/assets/:assetId/thumbnail', handleGetAssetThumbnail);

export { router };
