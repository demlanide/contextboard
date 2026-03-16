import { v4 as uuidv4 } from 'uuid';
import { withTransaction, withBoardMutation } from '../db/tx.js';
import { Board, ChatThread, CreateBoardRequest, UpdateBoardRequest } from '../schemas/board.schemas.js';
import {
  insertBoard,
  findBoardById,
  listBoards as listBoardsRepo,
  updateBoard as updateBoardRepo,
} from '../repos/boards.repo.js';
import { insertChatThread } from '../repos/chat-threads.repo.js';
import { buildOperation } from '../domain/operations/operation-factory.js';
import {
  assertBoardExists,
  assertBoardEditable,
  validateStatusTransition,
} from '../domain/validation/board-rules.js';
import { getNextRevision } from '../domain/revision/revision-policy.js';
import { logger } from '../obs/logger.js';

// ─── US1: Create Board ────────────────────────────────────────────────────────

export async function createBoard(
  data: CreateBoardRequest
): Promise<{ board: Board; chatThread: ChatThread }> {
  const boardId = uuidv4();
  const chatThreadId = uuidv4();

  return withTransaction(async (client) => {
    const board = await insertBoard(client, {
      id: boardId,
      title: data.title ?? 'Untitled board',
      description: data.description ?? null,
    });

    const chatThread = await insertChatThread(client, {
      id: chatThreadId,
      board_id: boardId,
    });

    // FR-005: board creation does NOT write an operation (revision 0 = genesis)
    logger.info('Board created', { boardId, chatThreadId });
    return { board, chatThread };
  });
}

// ─── US2: List Boards ─────────────────────────────────────────────────────────

export async function listBoards(): Promise<Board[]> {
  return withTransaction((client) => listBoardsRepo(client));
}

// ─── US3: Get Board ───────────────────────────────────────────────────────────

export async function getBoard(boardId: string): Promise<Board> {
  return withTransaction(async (client) => {
    const board = await findBoardById(client, boardId);
    assertBoardExists(board);
    return board!;
  });
}

// ─── US4: Update Board ────────────────────────────────────────────────────────

export async function updateBoard(
  boardId: string,
  patch: UpdateBoardRequest
): Promise<Board> {
  return withBoardMutation(boardId, async ({ client, board }) => {
    // Status transition (archive)
    if (patch.status !== undefined) {
      validateStatusTransition(board.status, patch.status);

      const newRevision = getNextRevision(board.revision, 'archive');
      const updated = await updateBoardRepo(client, boardId, {
        status: 'archived',
        revision: newRevision,
      });

      const op = buildOperation({
        boardId,
        boardRevision: newRevision,
        actorType: 'user',
        operationType: 'update_board',
        targetType: 'board',
        targetId: boardId,
        payload: { before: { status: board.status }, after: { status: 'archived' } },
        inversePayload: { before: { status: 'archived' }, after: { status: board.status } },
      });

      logger.info('Board archived', { boardId, newRevision });
      return { result: updated!, operations: [op], newRevision };
    }

    // Metadata update — board must be editable (not archived or deleted)
    assertBoardEditable(board);

    const newRevision = getNextRevision(board.revision, 'update');

    const fieldsToUpdate: Parameters<typeof updateBoardRepo>[2] = {
      revision: newRevision,
    };
    const changes: Record<string, unknown> = {};
    const previous: Record<string, unknown> = {};

    if (patch.title !== undefined) {
      fieldsToUpdate.title = patch.title;
      changes.title = patch.title;
      previous.title = board.title;
    }
    if (patch.description !== undefined) {
      fieldsToUpdate.description = patch.description;
      changes.description = patch.description;
      previous.description = board.description;
    }
    if (patch.viewportState !== undefined) {
      fieldsToUpdate.viewport_state = patch.viewportState;
      changes.viewportState = patch.viewportState;
      previous.viewportState = board.viewportState;
    }
    if (patch.settings !== undefined) {
      fieldsToUpdate.settings = patch.settings;
      changes.settings = patch.settings;
      previous.settings = board.settings;
    }
    if (patch.summary !== undefined) {
      fieldsToUpdate.summary = patch.summary;
      changes.summary = patch.summary;
      previous.summary = board.summary;
    }

    const updated = await updateBoardRepo(client, boardId, fieldsToUpdate);

    const op = buildOperation({
      boardId,
      boardRevision: newRevision,
      actorType: 'user',
      operationType: 'update_board',
      targetType: 'board',
      targetId: boardId,
      payload: { changes, previous },
      inversePayload: { changes: previous, previous: changes },
    });

    logger.info('Board updated', { boardId, newRevision });
    return { result: updated!, operations: [op], newRevision };
  });
}

// ─── US5: Delete Board ────────────────────────────────────────────────────────

export async function deleteBoard(boardId: string): Promise<{ success: true; boardId: string }> {
  return withBoardMutation(boardId, async ({ client, board }) => {
    await updateBoardRepo(client, boardId, { status: 'deleted' });

    const op = buildOperation({
      boardId,
      boardRevision: board.revision,
      actorType: 'user',
      operationType: 'update_board',
      targetType: 'board',
      targetId: boardId,
      payload: { before: { status: board.status }, after: { status: 'deleted' } },
      inversePayload: { before: { status: 'deleted' }, after: { status: board.status } },
    });

    logger.info('Board deleted', { boardId, previousRevision: board.revision });
    // newRevision: null — soft-delete does not bump revision (FR-014)
    return { result: { success: true as const, boardId }, operations: [op], newRevision: null };
  });
}
