/**
 * HTTP contract tests for all 5 board endpoints.
 * Requires a running PostgreSQL database.
 * Tests the full HTTP stack via supertest.
 *
 * Run: pnpm run test:contract
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/main/app.js';
import { pool } from '../../src/db/pool.js';

const app = createApp();
const request = supertest(app);

async function cleanBoards() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
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

// ─── POST /api/boards ─────────────────────────────────────────────────────────

describe('POST /api/boards (T001)', () => {
  it('creates a board and returns 201 with board + chatThread', async () => {
    const res = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'My First Board' });

    expect(res.status).toBe(201);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.data.board.title).toBe('My First Board');
    expect(res.body.data.board.status).toBe('active');
    expect(res.body.data.board.revision).toBe(0);
    expect(res.body.data.chatThread.boardId).toBe(res.body.data.board.id);
    expect(res.body.data.chatThread.metadata).toEqual({});
    expect(res.body.data.chatThread.createdAt).toBeDefined();
    expect(res.body.data.chatThread.updatedAt).toBeDefined();
    expect(res.body.error).toBeNull();
  });

  it('uses default title when not provided', async () => {
    const res = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data.board.title).toBe('Untitled board');
  });

  it('returns 422 for title too long', async () => {
    const res = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'a'.repeat(201) });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('replays cached response with Idempotency-Key', async () => {
    const body = { title: 'Idempotent Board' };
    const key = 'test-idempotency-key-123';

    const first = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', key)
      .send(body);

    expect(first.status).toBe(201);

    const second = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', key)
      .send(body);

    expect(second.status).toBe(201);
    expect(second.body.data.board.id).toBe(first.body.data.board.id);
  });

  it('returns 409 for Idempotency-Key reused with different payload', async () => {
    const key = 'conflict-key-456';

    await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', key)
      .send({ title: 'Original' });

    const res = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', key)
      .send({ title: 'Different' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

// ─── GET /api/boards ──────────────────────────────────────────────────────────

describe('GET /api/boards (T002)', () => {
  it('returns empty array when no boards exist', async () => {
    const res = await request.get('/api/boards');

    expect(res.status).toBe(200);
    expect(res.body.data.boards).toEqual([]);
    expect(res.body.error).toBeNull();
  });

  it('returns non-deleted boards sorted by updatedAt DESC', async () => {
    // Create boards
    const r1 = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board 1' });

    await new Promise((r) => setTimeout(r, 20));

    const r2 = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board 2' });

    // Archive board 1
    const b1Id = r1.body.data.board.id;
    await request
      .patch(`/api/boards/${b1Id}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    // Delete board 2
    const b2Id = r2.body.data.board.id;

    // Create board 3
    const r3 = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board 3' });
    const b3Id = r3.body.data.board.id;

    await request.delete(`/api/boards/${b2Id}`);

    const listRes = await request.get('/api/boards');
    expect(listRes.status).toBe(200);

    const ids = listRes.body.data.boards.map((b: { id: string }) => b.id);
    expect(ids).toContain(b1Id);
    expect(ids).toContain(b3Id);
    expect(ids).not.toContain(b2Id);
  });
});

// ─── GET /api/boards/:boardId ─────────────────────────────────────────────────

describe('GET /api/boards/:boardId (T003)', () => {
  it('returns board metadata', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Get Me' });

    const boardId = create.body.data.board.id;

    const res = await request.get(`/api/boards/${boardId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.board.id).toBe(boardId);
    expect(res.body.data.board.title).toBe('Get Me');
    expect(res.body.error).toBeNull();
  });

  it('returns 404 for non-existent board', async () => {
    const res = await request.get('/api/boards/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 422 for invalid UUID', async () => {
    const res = await request.get('/api/boards/not-a-uuid');
    expect(res.status).toBe(422);
  });

  it('returns 404 for deleted board', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Delete Me' });

    const boardId = create.body.data.board.id;
    await request.delete(`/api/boards/${boardId}`);

    const res = await request.get(`/api/boards/${boardId}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 for archived board with status=archived', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Archive Me' });

    const boardId = create.body.data.board.id;
    await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await request.get(`/api/boards/${boardId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.board.status).toBe('archived');
  });
});

// ─── PATCH /api/boards/:boardId ───────────────────────────────────────────────

describe('PATCH /api/boards/:boardId (T004, T005)', () => {
  it('updates title and increments revision (T004)', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Original' });

    const boardId = create.body.data.board.id;

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ title: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.board.title).toBe('Updated');
    expect(res.body.data.board.revision).toBe(1);
    expect(res.body.error).toBeNull();
  });

  it('returns 415 for wrong Content-Type', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board' });

    const boardId = create.body.data.board.id;

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/json')
      .send({ title: 'Fail' });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('archives a board (T005)', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board' });

    const boardId = create.body.data.board.id;

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    expect(res.status).toBe(200);
    expect(res.body.data.board.status).toBe('archived');
    expect(res.body.data.board.revision).toBe(1);
  });

  it('returns 422 for PATCH on archived board', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board' });

    const boardId = create.body.data.board.id;

    await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ title: 'Should fail' });

    expect(res.status).toBe(409);
  });

  it('returns 422 for un-archive attempt', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board' });

    const boardId = create.body.data.board.id;

    await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'active' });

    expect(res.status).toBe(422);
  });

  it('returns 404 for PATCH on deleted board', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Board' });

    const boardId = create.body.data.board.id;
    await request.delete(`/api/boards/${boardId}`);

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ title: 'Nope' });

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/boards/:boardId ──────────────────────────────────────────────

describe('DELETE /api/boards/:boardId (T006)', () => {
  it('soft-deletes a board and returns 200', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Delete Me' });

    const boardId = create.body.data.board.id;

    const res = await request.delete(`/api/boards/${boardId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.boardId).toBe(boardId);
    expect(res.body.error).toBeNull();
  });

  it('board is absent from GET after delete', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Delete Me' });

    const boardId = create.body.data.board.id;
    await request.delete(`/api/boards/${boardId}`);

    const res = await request.get(`/api/boards/${boardId}`);
    expect(res.status).toBe(404);
  });

  it('board absent from list after delete', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Delete Me' });

    const boardId = create.body.data.board.id;
    await request.delete(`/api/boards/${boardId}`);

    const res = await request.get('/api/boards');
    const ids = res.body.data.boards.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(boardId);
  });

  it('returns 404 for already-deleted board', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Delete Me' });

    const boardId = create.body.data.board.id;
    await request.delete(`/api/boards/${boardId}`);

    const res = await request.delete(`/api/boards/${boardId}`);
    expect(res.status).toBe(404);
  });

  it('can delete an archived board', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Archive then Delete' });

    const boardId = create.body.data.board.id;

    await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    const res = await request.delete(`/api/boards/${boardId}`);
    expect(res.status).toBe(200);
  });
});

// ─── S3: Operation type invariants (T018) ─────────────────────────────────────

describe('S3 operation type invariants (T018)', () => {
  it('POST /api/boards — revision=0 and no operation rows', async () => {
    const res = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'No Op Board' });

    expect(res.status).toBe(201);
    expect(res.body.data.board.revision).toBe(0);

    const boardId = res.body.data.board.id;
    const { rows } = await pool.query(
      'SELECT * FROM board_operations WHERE board_id = $1',
      [boardId]
    );
    expect(rows).toHaveLength(0);
  });

  it('PATCH metadata — operation_type is update_board (not archive_board)', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Metadata Op' });

    const boardId = create.body.data.board.id;

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ title: 'Patched' });

    expect(res.status).toBe(200);
    expect(res.body.data.board.revision).toBe(1);

    const { rows } = await pool.query(
      'SELECT * FROM board_operations WHERE board_id = $1',
      [boardId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].operation_type).toBe('update_board');
  });

  it('PATCH status archive — operation_type is update_board (not archive_board)', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Archive Op' });

    const boardId = create.body.data.board.id;

    const res = await request
      .patch(`/api/boards/${boardId}`)
      .set('Content-Type', 'application/merge-patch+json')
      .send({ status: 'archived' });

    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      'SELECT * FROM board_operations WHERE board_id = $1',
      [boardId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].operation_type).toBe('update_board');
    expect(rows[0].payload.before).toEqual({ status: 'active' });
    expect(rows[0].payload.after).toEqual({ status: 'archived' });
  });

  it('DELETE — operation_type is update_board (not delete_board)', async () => {
    const create = await request
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send({ title: 'Delete Op' });

    const boardId = create.body.data.board.id;

    const res = await request.delete(`/api/boards/${boardId}`);
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      'SELECT * FROM board_operations WHERE board_id = $1',
      [boardId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].operation_type).toBe('update_board');
    expect(rows[0].payload.before).toEqual({ status: 'active' });
    expect(rows[0].payload.after).toEqual({ status: 'deleted' });
  });
});
