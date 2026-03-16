/**
 * Integration tests for revision + operations invariants.
 * Requires a running PostgreSQL database.
 * Verifies all invariants from contracts/mutation-infrastructure.md §6.
 *
 * Run: pnpm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../src/db/pool.js';
import {
  createBoard,
  updateBoard,
  deleteBoard,
} from '../../src/services/boards.service.js';
import { BoardValidationError } from '../../src/domain/validation/board-rules.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cleanBoards() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

async function getOperations(boardId: string) {
  const { rows } = await pool.query(
    'SELECT * FROM board_operations WHERE board_id = $1 ORDER BY created_at ASC',
    [boardId]
  );
  return rows;
}

async function getBoardRevision(boardId: string): Promise<number> {
  const { rows } = await pool.query('SELECT revision FROM boards WHERE id = $1', [boardId]);
  return Number(rows[0].revision);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => { await cleanBoards(); });
afterAll(async () => { await cleanBoards(); await pool.end(); });
beforeEach(async () => { await cleanBoards(); });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Invariant 1: Board creation produces zero operation rows and revision=0', () => {
  it('creates board with revision=0 and no operations', async () => {
    const { board } = await createBoard({ title: 'Fresh Board' });

    expect(board.revision).toBe(0);

    const ops = await getOperations(board.id);
    expect(ops).toHaveLength(0);
  });
});

describe('Invariant 2: Title update produces revision=1 and one update_board operation', () => {
  it('writes one update_board operation with changes/previous payload', async () => {
    const { board } = await createBoard({ title: 'Original Title' });

    const updated = await updateBoard(board.id, { title: 'New Title' });

    expect(updated.revision).toBe(1);

    const ops = await getOperations(board.id);
    expect(ops).toHaveLength(1);
    expect(ops[0].operation_type).toBe('update_board');
    expect(ops[0].board_revision).toBe(1);
    expect(ops[0].actor_type).toBe('user');
    expect(ops[0].target_type).toBe('board');
    expect(ops[0].target_id).toBe(board.id);
    expect(ops[0].payload.changes).toEqual({ title: 'New Title' });
    expect(ops[0].payload.previous).toEqual({ title: 'Original Title' });
  });
});

describe('Invariant 3: Archive produces revision bump and update_board with before/after status', () => {
  it('archives board with revision bump and status payload', async () => {
    const { board } = await createBoard({ title: 'To Archive' });

    const archived = await updateBoard(board.id, { status: 'archived' });

    expect(archived.revision).toBe(1);
    expect(archived.status).toBe('archived');

    const ops = await getOperations(board.id);
    expect(ops).toHaveLength(1);
    expect(ops[0].operation_type).toBe('update_board');
    expect(ops[0].payload).toMatchObject({
      before: { status: 'active' },
      after: { status: 'archived' },
    });
  });
});

describe('Invariant 4: Soft-delete produces no revision bump and update_board with before/after status', () => {
  it('deletes board without bumping revision', async () => {
    const { board } = await createBoard({ title: 'To Delete' });

    await deleteBoard(board.id);

    const revision = await getBoardRevision(board.id);
    expect(revision).toBe(0);

    const ops = await getOperations(board.id);
    expect(ops).toHaveLength(1);
    expect(ops[0].operation_type).toBe('update_board');
    expect(ops[0].board_revision).toBe(0);
    expect(ops[0].payload).toMatchObject({
      before: { status: 'active' },
      after: { status: 'deleted' },
    });
  });
});

describe('Invariant 5: Sequential mutations produce monotonic revisions with no gaps', () => {
  it('produces revision 1, 2, 3 for three sequential updates', async () => {
    const { board } = await createBoard({ title: 'Board' });

    const r1 = await updateBoard(board.id, { title: 'Title 1' });
    const r2 = await updateBoard(board.id, { title: 'Title 2' });
    const r3 = await updateBoard(board.id, { description: 'desc' });

    expect(r1.revision).toBe(1);
    expect(r2.revision).toBe(2);
    expect(r3.revision).toBe(3);

    const ops = await getOperations(board.id);
    expect(ops).toHaveLength(3);
    expect(ops.map((o: { board_revision: number }) => o.board_revision)).toEqual([1, 2, 3]);
  });
});

describe('Invariant 6: Concurrent mutations to same board produce sequential revisions (advisory lock)', () => {
  it('serializes concurrent updates with no revision gaps', async () => {
    const { board } = await createBoard({ title: 'Concurrent' });

    // Launch 5 concurrent updates
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        updateBoard(board.id, { title: `Title ${i}` })
      )
    );

    const revisions = results.map((r) => r.revision).sort((a, b) => a - b);
    expect(revisions).toEqual([1, 2, 3, 4, 5]);

    const ops = await getOperations(board.id);
    expect(ops).toHaveLength(5);
    const opRevisions = ops.map((o: { board_revision: number }) => o.board_revision).sort((a: number, b: number) => a - b);
    expect(opRevisions).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Invariant 7: Failed mutation produces no operations and no revision change', () => {
  it('does not write operations or change revision when update is rejected', async () => {
    const { board } = await createBoard({ title: 'Stable' });
    // Archive the board so it becomes read-only
    await updateBoard(board.id, { status: 'archived' });

    const revisionBefore = await getBoardRevision(board.id);
    const opsBefore = await getOperations(board.id);

    // Attempt to update metadata on an archived board (should fail)
    await expect(
      updateBoard(board.id, { title: 'Should Fail' })
    ).rejects.toThrow(BoardValidationError);

    const revisionAfter = await getBoardRevision(board.id);
    const opsAfter = await getOperations(board.id);

    expect(revisionAfter).toBe(revisionBefore);
    expect(opsAfter).toHaveLength(opsBefore.length);
  });
});

describe('Invariant 8: Full lifecycle', () => {
  it('create→update×3→archive→delete produces correct revision sequence and operation count', async () => {
    const { board } = await createBoard({ title: 'Lifecycle' });
    expect(board.revision).toBe(0);

    const u1 = await updateBoard(board.id, { title: 'Update 1' });
    const u2 = await updateBoard(board.id, { title: 'Update 2' });
    const u3 = await updateBoard(board.id, { description: 'desc' });
    expect(u1.revision).toBe(1);
    expect(u2.revision).toBe(2);
    expect(u3.revision).toBe(3);

    const archived = await updateBoard(board.id, { status: 'archived' });
    expect(archived.revision).toBe(4);

    // Delete does not bump revision
    await deleteBoard(board.id);
    const finalRevision = await getBoardRevision(board.id);
    expect(finalRevision).toBe(4);

    // 3 metadata updates + 1 archive + 1 delete = 5 operations
    const ops = await getOperations(board.id);
    expect(ops).toHaveLength(5);
    expect(ops.every((o: { operation_type: string }) => o.operation_type === 'update_board')).toBe(true);

    // No legacy operation types
    const invalidTypes = ['create_board', 'delete_board', 'archive_board'];
    expect(ops.some((o: { operation_type: string }) => invalidTypes.includes(o.operation_type))).toBe(false);
  });
});
