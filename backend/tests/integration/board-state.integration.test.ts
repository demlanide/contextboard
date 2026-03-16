/**
 * Integration tests for board-state hydration queries.
 * Requires a running PostgreSQL database with migrations applied.
 * Seeds the DB directly to test query behavior.
 *
 * Run: pnpm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../src/db/pool.js';
import { getBoardState } from '../../src/services/board-state.service.js';
import { BoardNotFoundError } from '../../src/domain/validation/board-rules.js';
import { createBoard } from '../../src/services/boards.service.js';

async function cleanBoards() {
  await pool.query('DELETE FROM board_edges');
  await pool.query('DELETE FROM board_nodes');
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

async function seedNode(boardId: string, overrides: Record<string, unknown> = {}) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO board_nodes (id, board_id, type, z_index, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      boardId,
      overrides.type ?? 'sticky',
      overrides.z_index ?? 0,
      overrides.created_at ?? new Date(),
    ]
  );
  return id;
}

async function seedEdge(boardId: string, sourceNodeId: string, targetNodeId: string) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO board_edges (id, board_id, source_node_id, target_node_id)
     VALUES ($1, $2, $3, $4)`,
    [id, boardId, sourceNodeId, targetNodeId]
  );
  return id;
}

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

describe('getBoardState — integration', () => {
  it('returns lastOperationRevision equal to board.revision', async () => {
    const { board } = await createBoard({ title: 'Rev Test' });
    const state = await getBoardState(board.id);
    expect(state.lastOperationRevision).toBe(board.revision);
  });

  it('returns empty nodes and edges for a freshly created board', async () => {
    const { board } = await createBoard({ title: 'Empty Board' });
    const state = await getBoardState(board.id);
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
  });

  it('returns nodes ordered by z_index ASC then created_at ASC', async () => {
    const { board } = await createBoard({ title: 'Node Order Test' });
    const t1 = new Date('2026-03-16T10:00:00Z');
    const t2 = new Date('2026-03-16T10:00:01Z');
    const t3 = new Date('2026-03-16T10:00:02Z');

    const id1 = await seedNode(board.id, { z_index: 2, created_at: t1 });
    const id2 = await seedNode(board.id, { z_index: 1, created_at: t2 });
    const id3 = await seedNode(board.id, { z_index: 1, created_at: t3 });

    const state = await getBoardState(board.id);
    expect(state.nodes.map((n) => n.id)).toEqual([id2, id3, id1]);
  });

  it('excludes soft-deleted nodes', async () => {
    const { board } = await createBoard({ title: 'Soft Delete Test' });
    const activeId = await seedNode(board.id, { z_index: 0 });
    const deletedId = uuidv4();
    await pool.query(
      `INSERT INTO board_nodes (id, board_id, type, deleted_at)
       VALUES ($1, $2, 'sticky', now())`,
      [deletedId, board.id]
    );

    const state = await getBoardState(board.id);
    expect(state.nodes.map((n) => n.id)).toContain(activeId);
    expect(state.nodes.map((n) => n.id)).not.toContain(deletedId);
  });

  it('excludes soft-deleted edges', async () => {
    const { board } = await createBoard({ title: 'Edge Delete Test' });
    const n1 = await seedNode(board.id);
    const n2 = await seedNode(board.id);
    const n3 = await seedNode(board.id);
    const activeEdgeId = await seedEdge(board.id, n1, n2);
    const deletedEdgeId = uuidv4();
    await pool.query(
      `INSERT INTO board_edges (id, board_id, source_node_id, target_node_id, deleted_at)
       VALUES ($1, $2, $3, $4, now())`,
      [deletedEdgeId, board.id, n2, n3]
    );

    const state = await getBoardState(board.id);
    expect(state.edges.map((e) => e.id)).toContain(activeEdgeId);
    expect(state.edges.map((e) => e.id)).not.toContain(deletedEdgeId);
  });

  it('returns edges ordered by created_at ASC', async () => {
    const { board } = await createBoard({ title: 'Edge Order Test' });
    const n1 = await seedNode(board.id);
    const n2 = await seedNode(board.id);
    const n3 = await seedNode(board.id);

    const e1 = uuidv4();
    const e2 = uuidv4();
    await pool.query(
      `INSERT INTO board_edges (id, board_id, source_node_id, target_node_id, created_at)
       VALUES ($1, $2, $3, $4, '2026-03-16T10:00:02Z'),
              ($5, $2, $3, $6, '2026-03-16T10:00:01Z')`,
      [e1, board.id, n1, n2, e2, n3]
    );

    const state = await getBoardState(board.id);
    expect(state.edges.map((e) => e.id)).toEqual([e2, e1]);
  });

  it('returns chat thread for the board', async () => {
    const { board, chatThread } = await createBoard({ title: 'Thread Test' });
    const state = await getBoardState(board.id);
    expect(state.chatThread.id).toBe(chatThread.id);
    expect(state.chatThread.boardId).toBe(board.id);
  });

  it('returns mixed node types', async () => {
    const { board } = await createBoard({ title: 'Mixed Types' });
    await seedNode(board.id, { type: 'sticky' });
    await seedNode(board.id, { type: 'text' });
    await seedNode(board.id, { type: 'image' });
    await seedNode(board.id, { type: 'shape' });

    const state = await getBoardState(board.id);
    const types = state.nodes.map((n) => n.type).sort();
    expect(types).toEqual(['image', 'shape', 'sticky', 'text']);
  });
});
