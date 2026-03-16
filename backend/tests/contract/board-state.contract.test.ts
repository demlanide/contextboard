/**
 * HTTP contract tests for GET /api/boards/:boardId/state.
 * Requires a running PostgreSQL database with migrations applied.
 * Tests the full HTTP stack via supertest.
 *
 * Run: pnpm run test:contract
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../src/main/app.js';
import { pool } from '../../src/db/pool.js';
import { GetBoardStateResponseSchema } from '../../src/schemas/board-state.schemas.js';

const app = createApp();
const request = supertest(app);

async function cleanBoards() {
  await pool.query('DELETE FROM board_edges');
  await pool.query('DELETE FROM board_nodes');
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

async function createBoard(title = 'Test Board') {
  const res = await request
    .post('/api/boards')
    .set('Content-Type', 'application/json')
    .send({ title });
  return res.body.data as { board: { id: string }; chatThread: { id: string } };
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

describe('GET /api/boards/:boardId/state (T007)', () => {
  it('returns 200 with full state envelope for an active board', async () => {
    const { board } = await createBoard('Active Board');
    const res = await request.get(`/api/boards/${board.id}/state`);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    // Validate shape with Zod schema
    const parsed = GetBoardStateResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(res.body.data.board.id).toBe(board.id);
    expect(res.body.data.board.status).toBe('active');
    expect(res.body.data.lastOperationRevision).toBe(res.body.data.board.revision);
  });

  it('returns 200 with empty nodes and edges for a newly created board', async () => {
    const { board } = await createBoard('Empty Board');
    const res = await request.get(`/api/boards/${board.id}/state`);

    expect(res.status).toBe(200);
    expect(res.body.data.nodes).toEqual([]);
    expect(res.body.data.edges).toEqual([]);
    expect(res.body.data.lastOperationRevision).toBe(0);
  });

  it('excludes soft-deleted nodes from the response', async () => {
    const { board } = await createBoard('Node Soft Delete');
    const activeNodeId = uuidv4();
    const deletedNodeId = uuidv4();
    await pool.query(
      `INSERT INTO board_nodes (id, board_id, type) VALUES ($1, $2, 'sticky')`,
      [activeNodeId, board.id]
    );
    await pool.query(
      `INSERT INTO board_nodes (id, board_id, type, deleted_at) VALUES ($1, $2, 'sticky', now())`,
      [deletedNodeId, board.id]
    );

    const res = await request.get(`/api/boards/${board.id}/state`);

    expect(res.status).toBe(200);
    const nodeIds = res.body.data.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain(activeNodeId);
    expect(nodeIds).not.toContain(deletedNodeId);
  });

  it('returns 404 BOARD_NOT_FOUND for a deleted board', async () => {
    const { board } = await createBoard('To Be Deleted');
    await request.delete(`/api/boards/${board.id}`);

    const res = await request.get(`/api/boards/${board.id}/state`);

    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 404 BOARD_NOT_FOUND for a nonexistent board ID', async () => {
    const nonexistentId = uuidv4();
    const res = await request.get(`/api/boards/${nonexistentId}/state`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 200 with status=archived for an archived board', async () => {
    const { board } = await createBoard('To Be Archived');
    await request
      .patch(`/api/boards/${board.id}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await request.get(`/api/boards/${board.id}/state`);

    expect(res.status).toBe(200);
    expect(res.body.data.board.status).toBe('archived');
    expect(res.body.error).toBeNull();
  });

  it('returns 400 VALIDATION_ERROR for a malformed board ID', async () => {
    const res = await request.get('/api/boards/not-a-uuid/state');

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.boardId).toBe('not-a-uuid');
  });

  it('response shape is identical for empty, single-node, and populated boards', async () => {
    const { board: emptyBoard } = await createBoard('Empty');
    const { board: populatedBoard } = await createBoard('Populated');
    await pool.query(
      `INSERT INTO board_nodes (id, board_id, type) VALUES ($1, $2, 'sticky')`,
      [uuidv4(), populatedBoard.id]
    );

    const [emptyRes, populatedRes] = await Promise.all([
      request.get(`/api/boards/${emptyBoard.id}/state`),
      request.get(`/api/boards/${populatedBoard.id}/state`),
    ]);

    const emptyKeys = Object.keys(emptyRes.body.data).sort();
    const populatedKeys = Object.keys(populatedRes.body.data).sort();
    expect(emptyKeys).toEqual(populatedKeys);
  });
});
