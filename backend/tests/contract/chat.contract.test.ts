/**
 * HTTP contract tests for chat endpoints.
 * Requires a running PostgreSQL database.
 * Tests the full HTTP stack via supertest.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/main/app.js';
import { pool } from '../../src/db/pool.js';

const app = createApp();
const request = supertest(app);

async function clean() {
  await pool.query('DELETE FROM chat_messages');
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

async function createTestBoard(title = 'Chat Contract Test') {
  const res = await request
    .post('/api/boards')
    .set('Content-Type', 'application/json')
    .send({ title });
  return res.body.data.board;
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

// ─── GET /api/boards/:boardId/chat ──────────────────────────────────────────

describe('GET /api/boards/:boardId/chat', () => {
  it('returns 200 with thread and empty messages for new board', async () => {
    const board = await createTestBoard();
    const res = await request.get(`/api/boards/${board.id}/chat`);

    expect(res.status).toBe(200);
    expect(res.body.data.thread.id).toBeDefined();
    expect(res.body.data.thread.boardId).toBe(board.id);
    expect(res.body.data.messages).toEqual([]);
    expect(res.body.error).toBeNull();
  });

  it('returns 200 with messages after sending', async () => {
    const board = await createTestBoard();

    await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'Hello!' });

    const res = await request.get(`/api/boards/${board.id}/chat`);

    expect(res.status).toBe(200);
    expect(res.body.data.messages.length).toBeGreaterThanOrEqual(1);

    const msg = res.body.data.messages[0];
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('threadId');
    expect(msg).toHaveProperty('senderType');
    expect(msg).toHaveProperty('messageText');
    expect(msg).toHaveProperty('messageJson');
    expect(msg).toHaveProperty('selectionContext');
    expect(msg).toHaveProperty('createdAt');
  });

  it('returns 404 for deleted board', async () => {
    const board = await createTestBoard();
    await request.delete(`/api/boards/${board.id}`);

    const res = await request.get(`/api/boards/${board.id}/chat`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 422 for invalid boardId', async () => {
    const res = await request.get('/api/boards/not-a-uuid/chat');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ─── POST /api/boards/:boardId/chat/messages ────────────────────────────────

describe('POST /api/boards/:boardId/chat/messages', () => {
  it('returns 200 with userMessage and agentMessage', async () => {
    const board = await createTestBoard();
    const res = await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'Hello agent!' });

    expect(res.status).toBe(200);
    expect(res.body.data.userMessage.senderType).toBe('user');
    expect(res.body.data.userMessage.messageText).toBe('Hello agent!');
    expect(res.body.data.agentMessage).not.toBeNull();
    expect(res.body.data.agentMessage.senderType).toBe('agent');
  });

  it('returns 200 with selection context preserved', async () => {
    const board = await createTestBoard();
    const selectionContext = {
      selectedNodeIds: ['123e4567-e89b-12d3-a456-426614174000'],
      selectedEdgeIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    const res = await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'With context', selectionContext });

    expect(res.status).toBe(200);
    expect(res.body.data.userMessage.selectionContext).toEqual(selectionContext);
  });

  it('returns 409 for archived board', async () => {
    const board = await createTestBoard();
    await request
      .patch(`/api/boards/${board.id}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'Should fail' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOARD_ARCHIVED');
  });

  it('returns 404 for deleted board', async () => {
    const board = await createTestBoard();
    await request.delete(`/api/boards/${board.id}`);

    const res = await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'Should fail' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 422 for empty message', async () => {
    const board = await createTestBoard();
    const res = await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: '' });

    expect(res.status).toBe(422);
  });

  it('returns 422 for message exceeding max length', async () => {
    const board = await createTestBoard();
    const res = await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'a'.repeat(20001) });

    expect(res.status).toBe(422);
  });

  it('does not change board revision after message send', async () => {
    const board = await createTestBoard();
    const initialRevision = board.revision;

    await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'Check revision' });

    const boardRes = await request.get(`/api/boards/${board.id}`);
    expect(boardRes.body.data.board.revision).toBe(initialRevision);
  });

  it('response shape matches contract for success', async () => {
    const board = await createTestBoard();
    const res = await request
      .post(`/api/boards/${board.id}/chat/messages`)
      .set('Content-Type', 'application/json')
      .send({ message: 'Shape check' });

    expect(res.status).toBe(200);

    const { userMessage, agentMessage } = res.body.data;
    for (const msg of [userMessage, agentMessage]) {
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('threadId');
      expect(msg).toHaveProperty('senderType');
      expect(msg).toHaveProperty('messageText');
      expect(msg).toHaveProperty('messageJson');
      expect(msg).toHaveProperty('selectionContext');
      expect(msg).toHaveProperty('createdAt');
    }
  });
});
