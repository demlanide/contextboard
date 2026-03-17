/**
 * HTTP contract tests for edge CRUD endpoints.
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
let nodeAId: string;
let nodeBId: string;

async function createTestBoard(): Promise<string> {
  const res = await request
    .post('/api/boards')
    .set('Content-Type', 'application/json')
    .send({ title: 'Test Board' });
  return res.body.data.board.id;
}

async function createTestNode(bId: string, text = 'Test') {
  const res = await request
    .post(`/api/boards/${bId}/nodes`)
    .set('Content-Type', 'application/json')
    .send({ type: 'sticky', x: 100, y: 200, width: 200, height: 120, content: { text } });
  return res.body.data.node;
}

async function createTestEdge(bId: string, srcId: string, tgtId: string, label: string | null = null) {
  return request
    .post(`/api/boards/${bId}/edges`)
    .set('Content-Type', 'application/json')
    .send({ sourceNodeId: srcId, targetNodeId: tgtId, label });
}

beforeAll(async () => { await cleanAll(); });
afterAll(async () => { await cleanAll(); await pool.end(); });

beforeEach(async () => {
  await cleanAll();
  boardId = await createTestBoard();
  const nodeA = await createTestNode(boardId, 'Node A');
  const nodeB = await createTestNode(boardId, 'Node B');
  nodeAId = nodeA.id;
  nodeBId = nodeB.id;
});

// ─── POST /api/boards/:boardId/edges ────────────────────────────────────────

describe('POST /api/boards/:boardId/edges', () => {
  it('returns 201 with edge + boardRevision', async () => {
    const res = await createTestEdge(boardId, nodeAId, nodeBId, 'leads to');

    expect(res.status).toBe(201);
    expect(res.body.data.edge.sourceNodeId).toBe(nodeAId);
    expect(res.body.data.edge.targetNodeId).toBe(nodeBId);
    expect(res.body.data.edge.label).toBe('leads to');
    expect(res.body.data.boardRevision).toBe(3); // 2 nodes + 1 edge
    expect(res.body.error).toBeNull();
  });

  it('returns 422 for self-loop', async () => {
    const res = await createTestEdge(boardId, nodeAId, nodeAId);
    expect(res.status).toBe(422);
  });

  it('returns 422 for non-existent node', async () => {
    const res = await createTestEdge(boardId, nodeAId, '00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(422);
  });

  it('returns 409 on archived board', async () => {
    await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await createTestEdge(boardId, nodeAId, nodeBId);
    expect(res.status).toBe(409);
  });

  it('returns 404 on non-existent board', async () => {
    const res = await createTestEdge('00000000-0000-0000-0000-000000000099', nodeAId, nodeBId);
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/edges/:edgeId ───────────────────────────────────────────────

describe('PATCH /api/edges/:edgeId', () => {
  it('returns 200 with updated edge + boardRevision', async () => {
    const createRes = await createTestEdge(boardId, nodeAId, nodeBId, 'original');
    const edgeId = createRes.body.data.edge.id;

    const res = await request
      .patch(`/api/edges/${edgeId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ label: 'updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.edge.label).toBe('updated');
    expect(res.body.data.boardRevision).toBe(4);
  });

  it('returns 415 for wrong content-type', async () => {
    const createRes = await createTestEdge(boardId, nodeAId, nodeBId);
    const edgeId = createRes.body.data.edge.id;

    const res = await request
      .patch(`/api/edges/${edgeId}`)
      .set('Content-Type', 'application/json')
      .send({ label: 'test' });

    expect(res.status).toBe(415);
  });

  it('returns 404 for non-existent edge', async () => {
    const res = await request
      .patch('/api/edges/00000000-0000-0000-0000-000000000099')
      .set('Content-Type', 'application/merge-patch+json')
      .send({ label: 'test' });

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/edges/:edgeId ──────────────────────────────────────────────

describe('DELETE /api/edges/:edgeId', () => {
  it('returns 200 with deletedEdgeId + boardRevision', async () => {
    const createRes = await createTestEdge(boardId, nodeAId, nodeBId);
    const edgeId = createRes.body.data.edge.id;

    const res = await request.delete(`/api/edges/${edgeId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.deletedEdgeId).toBe(edgeId);
    expect(res.body.data.boardRevision).toBe(4);
  });

  it('returns 404 for non-existent edge', async () => {
    const res = await request.delete('/api/edges/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});
