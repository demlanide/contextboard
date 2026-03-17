/**
 * HTTP contract tests for node CRUD endpoints.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/main/app.js';
import { pool } from '../../src/db/pool.js';

const app = createApp();
const request = supertest(app);

async function cleanAll() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM board_edges');
  await pool.query('DELETE FROM board_nodes');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

let boardId: string;

async function createTestBoard(): Promise<string> {
  const res = await request
    .post('/api/boards')
    .set('Content-Type', 'application/json')
    .send({ title: 'Test Board' });
  return res.body.data.board.id;
}

async function createTestNode(bId: string, content: Record<string, unknown> = { text: 'Test' }) {
  return request
    .post(`/api/boards/${bId}/nodes`)
    .set('Content-Type', 'application/json')
    .send({
      type: 'sticky',
      x: 100,
      y: 200,
      width: 200,
      height: 120,
      content,
    });
}

beforeAll(async () => {
  await cleanAll();
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

beforeEach(async () => {
  await cleanAll();
  boardId = await createTestBoard();
});

// ─── POST /api/boards/:boardId/nodes ─────────────────────────────────────────

describe('POST /api/boards/:boardId/nodes', () => {
  it('returns 201 with node + boardRevision', async () => {
    const res = await createTestNode(boardId);

    expect(res.status).toBe(201);
    expect(res.body.data.node.type).toBe('sticky');
    expect(res.body.data.node.boardId).toBe(boardId);
    expect(res.body.data.boardRevision).toBe(1);
    expect(res.body.error).toBeNull();
  });

  it('returns 422 for invalid content', async () => {
    const res = await request
      .post(`/api/boards/${boardId}/nodes`)
      .set('Content-Type', 'application/json')
      .send({
        type: 'sticky',
        x: 100,
        y: 200,
        width: 200,
        height: 120,
        content: {},
      });

    expect(res.status).toBe(422);
  });

  it('returns 404 for non-existent board', async () => {
    const res = await request
      .post('/api/boards/00000000-0000-0000-0000-000000000099/nodes')
      .set('Content-Type', 'application/json')
      .send({
        type: 'sticky',
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        content: { text: 'Test' },
      });

    expect(res.status).toBe(404);
  });

  it('returns 409 for archived board', async () => {
    await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await createTestNode(boardId);
    expect(res.status).toBe(409);
  });
});

// ─── PATCH /api/nodes/:nodeId ────────────────────────────────────────────────

describe('PATCH /api/nodes/:nodeId', () => {
  it('returns 200 with updated node + boardRevision', async () => {
    const createRes = await createTestNode(boardId);
    const nodeId = createRes.body.data.node.id;

    const res = await request
      .patch(`/api/nodes/${nodeId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ x: 500, y: 600 });

    expect(res.status).toBe(200);
    expect(res.body.data.node.x).toBe(500);
    expect(res.body.data.node.y).toBe(600);
    expect(res.body.data.boardRevision).toBe(2);
  });

  it('returns 415 for wrong content-type', async () => {
    const createRes = await createTestNode(boardId);
    const nodeId = createRes.body.data.node.id;

    const res = await request
      .patch(`/api/nodes/${nodeId}`)
      .set('Content-Type', 'application/json')
      .send({ x: 500 });

    expect(res.status).toBe(415);
  });

  it('returns 409 for locked node', async () => {
    const createRes = await createTestNode(boardId);
    const nodeId = createRes.body.data.node.id;

    // Lock the node
    await request
      .patch(`/api/nodes/${nodeId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ locked: true });

    const res = await request
      .patch(`/api/nodes/${nodeId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ x: 500 });

    expect(res.status).toBe(409);
  });

  it('returns 404 for non-existent node', async () => {
    const res = await request
      .patch('/api/nodes/00000000-0000-0000-0000-000000000099')
      .set('Content-Type', 'application/merge-patch+json')
      .send({ x: 500 });

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/nodes/:nodeId ───────────────────────────────────────────────

describe('DELETE /api/nodes/:nodeId', () => {
  it('returns 200 with deletedNodeId + deletedEdgeIds + boardRevision', async () => {
    const createRes = await createTestNode(boardId);
    const nodeId = createRes.body.data.node.id;

    const res = await request.delete(`/api/nodes/${nodeId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.deletedNodeId).toBe(nodeId);
    expect(res.body.data.deletedEdgeIds).toEqual([]);
    expect(res.body.data.boardRevision).toBe(2);
  });

  it('returns 409 for locked node', async () => {
    const createRes = await createTestNode(boardId);
    const nodeId = createRes.body.data.node.id;

    await request
      .patch(`/api/nodes/${nodeId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ locked: true });

    const res = await request.delete(`/api/nodes/${nodeId}`);
    expect(res.status).toBe(409);
  });

  it('returns 404 for non-existent node', async () => {
    const res = await request.delete('/api/nodes/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});
