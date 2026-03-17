/**
 * HTTP contract tests for batch node mutations endpoint.
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
    .send({ title: 'Batch Contract Test Board' });
  return res.body.data.board.id;
}

async function createTestNode(bId: string) {
  const res = await request
    .post(`/api/boards/${bId}/nodes`)
    .set('Content-Type', 'application/json')
    .send({
      type: 'sticky',
      x: 100, y: 200, width: 200, height: 120,
      content: { text: 'Test Node' },
    });
  return res.body.data.node;
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

describe('POST /api/boards/:boardId/nodes/batch', () => {
  it('returns 200 with batchId, boardRevision, created, updated, deleted', async () => {
    const res = await request
      .post(`/api/boards/${boardId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({
        operations: [
          {
            type: 'create',
            tempId: 'tmp-1',
            node: { type: 'sticky', x: 10, y: 20, width: 200, height: 120, content: { text: 'Batch' } },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.batchId).toBeTruthy();
    expect(res.body.data.boardRevision).toBeGreaterThan(0);
    expect(res.body.data.created).toHaveLength(1);
    expect(res.body.data.created[0].tempId).toBe('tmp-1');
    expect(res.body.data.created[0].id).toBeTruthy();
    expect(res.body.data.updated).toEqual([]);
    expect(res.body.data.deleted).toEqual([]);
    expect(res.body.error).toBeNull();
  });

  it('created entries include tempId field', async () => {
    const res = await request
      .post(`/api/boards/${boardId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({
        operations: [
          { type: 'create', tempId: 'my-temp', node: { type: 'sticky', x: 0, y: 0, width: 200, height: 120, content: { text: 'Hi' } } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.created[0].tempId).toBe('my-temp');
  });

  it('deleted entries have type field', async () => {
    const node = await createTestNode(boardId);

    const res = await request
      .post(`/api/boards/${boardId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({
        operations: [{ type: 'delete', nodeId: node.id }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.deleted[0].type).toBe('node');
  });

  it('returns 422 for empty operations', async () => {
    const res = await request
      .post(`/api/boards/${boardId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({ operations: [] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent board', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await request
      .post(`/api/boards/${fakeId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({
        operations: [
          { type: 'create', tempId: 'tmp-1', node: { type: 'sticky', x: 0, y: 0, width: 200, height: 120, content: { text: 'X' } } },
        ],
      });

    expect(res.status).toBe(404);
  });

  it('returns 409 for archived board', async () => {
    // Archive the board
    await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await request
      .post(`/api/boards/${boardId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({
        operations: [
          { type: 'create', tempId: 'tmp-1', node: { type: 'sticky', x: 0, y: 0, width: 200, height: 120, content: { text: 'X' } } },
        ],
      });

    expect(res.status).toBe(409);
  });

  it('returns 409 for locked node target', async () => {
    const node = await createTestNode(boardId);
    // Lock the node
    await request
      .patch(`/api/nodes/${node.id}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ locked: true });

    const res = await request
      .post(`/api/boards/${boardId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({
        operations: [{ type: 'update', nodeId: node.id, changes: { x: 999 } }],
      });

    expect(res.status).toBe(409);
  });

  it('accepts application/json content type', async () => {
    const res = await request
      .post(`/api/boards/${boardId}/nodes/batch`)
      .set('Content-Type', 'application/json')
      .send({
        operations: [
          { type: 'create', tempId: 'tmp-1', node: { type: 'sticky', x: 0, y: 0, width: 200, height: 120, content: { text: 'OK' } } },
        ],
      });

    expect(res.status).toBe(200);
  });
});
