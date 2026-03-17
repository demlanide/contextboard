/**
 * HTTP contract tests for asset endpoints.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import supertest from 'supertest';
import { createApp } from '../../src/main/app.js';
import { pool } from '../../src/db/pool.js';
import { setAssetStorage } from '../../src/services/assets.service.js';
import { LocalAssetStorage } from '../../src/assets/storage/local-storage.js';

const app = createApp();
const request = supertest(app);
let storagePath: string;

async function cleanAll() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM board_edges');
  await pool.query('DELETE FROM board_nodes');
  await pool.query('DELETE FROM assets');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

async function createTestBoard(): Promise<string> {
  const res = await request
    .post('/api/boards')
    .set('Content-Type', 'application/json')
    .send({ title: 'Asset Test Board' });
  return res.body.data.board.id;
}

async function createTestPng(width = 100, height = 80): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

let boardId: string;

beforeAll(async () => {
  storagePath = await mkdtemp(resolve(tmpdir(), 'cb-contract-'));
  setAssetStorage(new LocalAssetStorage(storagePath));
  await cleanAll();
});

afterAll(async () => {
  await cleanAll();
  await rm(storagePath, { recursive: true, force: true });
  await pool.end();
});

beforeEach(async () => {
  await cleanAll();
  boardId = await createTestBoard();
});

// ─── POST /api/assets/upload ─────────────────────────────────────────────────

describe('POST /api/assets/upload', () => {
  it('returns 201 with asset metadata for valid PNG upload', async () => {
    const png = await createTestPng(800, 600);

    const res = await request
      .post('/api/assets/upload')
      .field('boardId', boardId)
      .attach('file', png, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data.asset).toBeDefined();
    expect(res.body.data.asset.kind).toBe('image');
    expect(res.body.data.asset.mimeType).toBe('image/png');
    expect(res.body.data.asset.processingStatus).toBe('ready');
    expect(res.body.data.asset.width).toBe(800);
    expect(res.body.data.asset.height).toBe(600);
    expect(res.body.data.asset.url).toContain('/file');
    expect(res.body.data.asset.thumbnailUrl).toContain('/thumbnail');
    expect(res.body.data.boardRevision).toBeGreaterThan(0);
    expect(res.body.error).toBeNull();
  });

  it('returns 400 for missing file', async () => {
    const res = await request
      .post('/api/assets/upload')
      .field('boardId', boardId);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing boardId', async () => {
    const png = await createTestPng();
    const res = await request
      .post('/api/assets/upload')
      .attach('file', png, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent board', async () => {
    const png = await createTestPng();
    const res = await request
      .post('/api/assets/upload')
      .field('boardId', '00000000-0000-0000-0000-000000000099')
      .attach('file', png, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/assets/:assetId ────────────────────────────────────────────────

describe('GET /api/assets/:assetId', () => {
  it('returns 200 with asset metadata', async () => {
    const png = await createTestPng();
    const uploadRes = await request
      .post('/api/assets/upload')
      .field('boardId', boardId)
      .attach('file', png, { filename: 'meta.png', contentType: 'image/png' });

    const assetId = uploadRes.body.data.asset.id;

    const res = await request.get(`/api/assets/${assetId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.asset.id).toBe(assetId);
    expect(res.body.error).toBeNull();
  });

  it('returns 404 for unknown asset', async () => {
    const res = await request.get('/api/assets/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSET_NOT_FOUND');
  });
});

// ─── GET /api/assets/:assetId/file ───────────────────────────────────────────

describe('GET /api/assets/:assetId/file', () => {
  it('returns 200 with correct content type', async () => {
    const png = await createTestPng();
    const uploadRes = await request
      .post('/api/assets/upload')
      .field('boardId', boardId)
      .attach('file', png, { filename: 'file.png', contentType: 'image/png' });

    const assetId = uploadRes.body.data.asset.id;

    const res = await request.get(`/api/assets/${assetId}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('returns 404 for unknown asset', async () => {
    const res = await request.get('/api/assets/00000000-0000-0000-0000-000000000099/file');
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/assets/:assetId/thumbnail ──────────────────────────────────────

describe('GET /api/assets/:assetId/thumbnail', () => {
  it('returns 200 with webp content type for image asset', async () => {
    const png = await createTestPng();
    const uploadRes = await request
      .post('/api/assets/upload')
      .field('boardId', boardId)
      .attach('file', png, { filename: 'thumb.png', contentType: 'image/png' });

    const assetId = uploadRes.body.data.asset.id;

    const res = await request.get(`/api/assets/${assetId}/thumbnail`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
  });

  it('returns 404 for unknown asset', async () => {
    const res = await request.get('/api/assets/00000000-0000-0000-0000-000000000099/thumbnail');
    expect(res.status).toBe(404);
  });
});
