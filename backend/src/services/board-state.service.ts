import { withTransaction } from '../db/tx.js';
import { BoardState } from '../schemas/board-state.schemas.js';
import { findByIdExcludingDeleted } from '../repos/boards.repo.js';
import { findActiveByBoardId as findActiveNodes } from '../repos/nodes.repo.js';
import { findActiveByBoardId as findActiveEdges } from '../repos/edges.repo.js';
import { findByBoardId as findChatThread } from '../repos/chat-threads.repo.js';
import { BoardNotFoundError } from '../domain/validation/board-rules.js';
import { logger } from '../obs/logger.js';

export async function getBoardState(boardId: string): Promise<BoardState> {
  return withTransaction(async (client) => {
    const board = await findByIdExcludingDeleted(client, boardId);
    if (!board) {
      logger.warn('Board not found or deleted during state hydration', { boardId });
      throw new BoardNotFoundError();
    }

    if (board.status === 'archived') {
      logger.info('Serving state for archived board', { boardId });
    }

    const [nodes, edges, chatThread] = await Promise.all([
      findActiveNodes(client, boardId),
      findActiveEdges(client, boardId),
      findChatThread(client, boardId),
    ]);

    if (!chatThread) {
      logger.error('Chat thread missing for active board — data integrity failure', { boardId });
      throw new Error('Board state could not be loaded');
    }

    return {
      board,
      nodes,
      edges,
      chatThread,
      lastOperationRevision: board.revision,
    };
  });
}
