/**
 * Integration tests for chat persistence.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { createBoard, updateBoard, deleteBoard } from '../../src/services/boards.service.js';
import { getChatHistory, sendMessage } from '../../src/services/chat.service.js';
import { BoardNotFoundError, BoardError } from '../../src/domain/validation/board-rules.js';
import { ChatValidationError } from '../../src/domain/validation/chat-rules.js';

async function clean() {
  await pool.query('DELETE FROM chat_messages');
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

beforeAll(async () => {
  await clean();
});

afterAll(async () => {
  await clean();
  await pool.end();
});

beforeEach(async () => {
  await clean();
});

describe('getChatHistory', () => {
  it('returns empty messages for a new board', async () => {
    const { board } = await createBoard({ title: 'Chat Test' });
    const result = await getChatHistory(board.id);

    expect(result.thread.boardId).toBe(board.id);
    expect(result.messages).toEqual([]);
  });

  it('returns messages in chronological order', async () => {
    const { board } = await createBoard({ title: 'Chat Test' });

    // Send two messages to populate history
    await sendMessage(board.id, { message: 'First message' });
    await sendMessage(board.id, { message: 'Second message' });

    const result = await getChatHistory(board.id);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);

    // Check chronological order
    for (let i = 1; i < result.messages.length; i++) {
      expect(new Date(result.messages[i].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(result.messages[i - 1].createdAt).getTime());
    }
  });

  it('throws BoardNotFoundError for deleted board', async () => {
    const { board } = await createBoard({ title: 'To Delete' });
    await deleteBoard(board.id);

    await expect(getChatHistory(board.id)).rejects.toThrow(BoardNotFoundError);
  });

  it('allows reading chat for archived boards', async () => {
    const { board } = await createBoard({ title: 'To Archive' });
    await updateBoard(board.id, { status: 'archived' });

    const result = await getChatHistory(board.id);
    expect(result.thread.boardId).toBe(board.id);
  });
});

describe('sendMessage', () => {
  it('persists user message and returns agent response', async () => {
    const { board } = await createBoard({ title: 'Send Test' });
    const result = await sendMessage(board.id, { message: 'Hello agent!' });

    expect(result.userMessage.senderType).toBe('user');
    expect(result.userMessage.messageText).toBe('Hello agent!');
    expect(result.agentMessage).not.toBeNull();
    expect(result.agentMessage!.senderType).toBe('agent');
  });

  it('persists message with selection context', async () => {
    const { board } = await createBoard({ title: 'Selection Test' });
    const selectionContext = {
      selectedNodeIds: ['123e4567-e89b-12d3-a456-426614174000'],
      selectedEdgeIds: [],
      viewport: { x: 100, y: 200, zoom: 1.5 },
    };

    const result = await sendMessage(board.id, {
      message: 'With context',
      selectionContext,
    });

    expect(result.userMessage.selectionContext).toEqual(selectionContext);
  });

  it('does not increment board revision', async () => {
    const { board } = await createBoard({ title: 'Revision Test' });
    const initialRevision = board.revision;

    await sendMessage(board.id, { message: 'Test message' });

    const history = await getChatHistory(board.id);
    // Board revision should not have changed
    // Verify by re-reading the board
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT revision FROM boards WHERE id = $1', [board.id]);
      expect(rows[0].revision).toBe(initialRevision);
    } finally {
      client.release();
    }
  });

  it('rejects sending to archived board with BOARD_ARCHIVED', async () => {
    const { board } = await createBoard({ title: 'Archive Test' });
    await updateBoard(board.id, { status: 'archived' });

    await expect(sendMessage(board.id, { message: 'Nope' }))
      .rejects.toThrow(BoardError);

    try {
      await sendMessage(board.id, { message: 'Nope' });
    } catch (err) {
      expect((err as BoardError).code).toBe('BOARD_ARCHIVED');
    }
  });

  it('rejects sending to deleted board', async () => {
    const { board } = await createBoard({ title: 'Delete Test' });
    await deleteBoard(board.id);

    await expect(sendMessage(board.id, { message: 'Nope' }))
      .rejects.toThrow(BoardNotFoundError);
  });

  it('messages persist after reload', async () => {
    const { board } = await createBoard({ title: 'Persistence Test' });
    await sendMessage(board.id, { message: 'Persistent message' });

    const history = await getChatHistory(board.id);
    const userMessages = history.messages.filter((m) => m.senderType === 'user');
    expect(userMessages.some((m) => m.messageText === 'Persistent message')).toBe(true);
  });
});
