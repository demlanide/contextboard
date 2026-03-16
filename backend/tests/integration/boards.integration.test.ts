/**
 * Integration tests for the full board lifecycle.
 * Requires a running PostgreSQL database.
 * Set DATABASE_URL env var or use defaults from env.ts.
 *
 * Run: pnpm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../src/db/pool.js';

async function cleanBoards() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

import {
  createBoard,
  listBoards,
  getBoard,
  updateBoard,
  deleteBoard,
} from '../../src/services/boards.service.js';
import { BoardNotFoundError, BoardValidationError } from '../../src/domain/validation/board-rules.js';

beforeAll(async () => {
  await cleanBoards();
});

afterAll(async () => {
  await cleanBoards();
  await pool.end();
});

beforeEach(async () => {
  await cleanBoards();
});

describe('createBoard', () => {
  it('creates a board with revision=0 and provisions a chat thread', async () => {
    const { board, chatThread } = await createBoard({ title: 'Test Board' });

    expect(board.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(board.title).toBe('Test Board');
    expect(board.status).toBe('active');
    expect(board.revision).toBe(0);
    expect(chatThread.boardId).toBe(board.id);
    expect(chatThread.metadata).toEqual({});
  });

  it('creates a board with description', async () => {
    const { board } = await createBoard({
      title: 'Board with Desc',
      description: 'A description',
    });
    expect(board.description).toBe('A description');
  });
});

describe('listBoards', () => {
  it('returns empty array when no boards exist', async () => {
    const boards = await listBoards();
    expect(boards).toEqual([]);
  });

  it('returns active and archived boards, excludes deleted', async () => {
    const { board: b1 } = await createBoard({ title: 'Active' });
    const { board: b2 } = await createBoard({ title: 'To Archive' });
    const { board: b3 } = await createBoard({ title: 'To Delete' });

    await updateBoard(b2.id, { status: 'archived' });
    await deleteBoard(b3.id);

    const boards = await listBoards();
    const ids = boards.map((b) => b.id);
    expect(ids).toContain(b1.id);
    expect(ids).toContain(b2.id);
    expect(ids).not.toContain(b3.id);
  });

  it('sorts by updatedAt DESC', async () => {
    const { board: b1 } = await createBoard({ title: 'First' });
    // Update b1 to give it a newer updatedAt
    await new Promise((r) => setTimeout(r, 10));
    const { board: b2 } = await createBoard({ title: 'Second' });

    const boards = await listBoards();
    expect(boards[0].id).toBe(b2.id);
    expect(boards[1].id).toBe(b1.id);
  });
});

describe('getBoard', () => {
  it('returns board by id', async () => {
    const { board } = await createBoard({ title: 'Get Me' });
    const fetched = await getBoard(board.id);
    expect(fetched.id).toBe(board.id);
    expect(fetched.title).toBe('Get Me');
  });

  it('throws BoardNotFoundError for missing board', async () => {
    await expect(getBoard('00000000-0000-0000-0000-000000000000')).rejects.toThrow(BoardNotFoundError);
  });

  it('throws BoardNotFoundError for deleted board', async () => {
    const { board } = await createBoard({ title: 'Delete Me' });
    await deleteBoard(board.id);
    await expect(getBoard(board.id)).rejects.toThrow(BoardNotFoundError);
  });

  it('returns archived board with status=archived', async () => {
    const { board } = await createBoard({ title: 'Archive Me' });
    await updateBoard(board.id, { status: 'archived' });
    const fetched = await getBoard(board.id);
    expect(fetched.status).toBe('archived');
  });
});

describe('updateBoard', () => {
  it('updates title and increments revision', async () => {
    const { board } = await createBoard({ title: 'Original' });
    expect(board.revision).toBe(0);

    const updated = await updateBoard(board.id, { title: 'Updated' });
    expect(updated.title).toBe('Updated');
    expect(updated.revision).toBe(1);
  });

  it('archives a board and increments revision', async () => {
    const { board } = await createBoard({ title: 'Archive Board' });
    const archived = await updateBoard(board.id, { status: 'archived' });

    expect(archived.status).toBe('archived');
    expect(archived.revision).toBe(1);
  });

  it('rejects PATCH on archived board for metadata changes', async () => {
    const { board } = await createBoard({ title: 'To Archive' });
    await updateBoard(board.id, { status: 'archived' });

    await expect(updateBoard(board.id, { title: 'Should fail' })).rejects.toThrow(BoardValidationError);
  });

  it('rejects un-archive (archived → active)', async () => {
    const { board } = await createBoard({ title: 'Board' });
    await updateBoard(board.id, { status: 'archived' });

    await expect(updateBoard(board.id, { status: 'active' })).rejects.toThrow(BoardValidationError);
  });

  it('throws BoardNotFoundError for deleted board', async () => {
    const { board } = await createBoard({ title: 'Board' });
    await deleteBoard(board.id);
    await expect(updateBoard(board.id, { title: 'Nope' })).rejects.toThrow(BoardNotFoundError);
  });
});

describe('deleteBoard', () => {
  it('soft-deletes a board', async () => {
    const { board } = await createBoard({ title: 'Delete Me' });
    const result = await deleteBoard(board.id);

    expect(result.success).toBe(true);
    expect(result.boardId).toBe(board.id);

    await expect(getBoard(board.id)).rejects.toThrow(BoardNotFoundError);
  });

  it('does not increment revision on delete', async () => {
    const { board } = await createBoard({ title: 'Board' });
    await updateBoard(board.id, { title: 'Updated' }); // revision = 1

    await deleteBoard(board.id);

    // Verify op log was written with revision=1 (pre-delete)
    const { rows } = await pool.query(
      `SELECT board_revision FROM board_operations WHERE board_id = $1 AND operation_type = 'delete_board'`,
      [board.id]
    );
    expect(rows[0].board_revision).toBe(1);
  });

  it('throws BoardNotFoundError when deleting already-deleted board', async () => {
    const { board } = await createBoard({ title: 'Board' });
    await deleteBoard(board.id);
    await expect(deleteBoard(board.id)).rejects.toThrow(BoardNotFoundError);
  });

  it('can delete an archived board', async () => {
    const { board } = await createBoard({ title: 'Board' });
    await updateBoard(board.id, { status: 'archived' });
    const result = await deleteBoard(board.id);
    expect(result.success).toBe(true);
  });
});
