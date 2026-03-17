/**
 * Integration tests for asset upload flow.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { pool } from '../../src/db/pool.js';
import { createBoard } from '../../src/services/boards.service.js';
import { uploadAsset, getAssetMetadata, setAssetStorage } from '../../src/services/assets.service.js';
import { LocalAssetStorage } from '../../src/assets/storage/local-storage.js';
import { AssetError, AssetNotFoundError } from '../../src/domain/validation/asset-rules.js';

let boardId: string;
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

async function createTestPng(width = 100, height = 100): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 128, b: 255 } },
  })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  storagePath = await mkdtemp(resolve(tmpdir(), 'cb-test-'));
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
  const { board } = await createBoard({ title: 'Test Board' });
  boardId = board.id;
});

describe('uploadAsset', () => {
  it('uploads a PNG and returns 201-equivalent metadata', async () => {
    const pngBuffer = await createTestPng(800, 600);
    const result = await uploadAsset({
      boardId,
      file: {
        buffer: pngBuffer,
        originalname: 'test.png',
        mimetype: 'image/png',
        size: pngBuffer.length,
      },
    });

    expect(result.asset.id).toBeDefined();
    expect(result.asset.boardId).toBe(boardId);
    expect(result.asset.kind).toBe('image');
    expect(result.asset.mimeType).toBe('image/png');
    expect(result.asset.processingStatus).toBe('ready');
    expect(result.asset.width).toBe(800);
    expect(result.asset.height).toBe(600);
    expect(result.asset.url).toContain('/api/assets/');
    expect(result.asset.thumbnailUrl).toContain('/thumbnail');
    expect(result.boardRevision).toBeGreaterThan(0);
  });

  it('rejects oversize image (> 20 MB)', async () => {
    // Create a fake "file" object that's oversized
    const bigBuffer = Buffer.alloc(21 * 1024 * 1024);
    // Put PNG header so MIME detection works
    const pngHeader = await createTestPng(1, 1);
    pngHeader.copy(bigBuffer);

    await expect(
      uploadAsset({
        boardId,
        file: {
          buffer: bigBuffer,
          originalname: 'big.png',
          mimetype: 'image/png',
          size: bigBuffer.length,
        },
      })
    ).rejects.toThrow(AssetError);
  });

  it('rejects mismatched MIME type', async () => {
    const pngBuffer = await createTestPng();
    await expect(
      uploadAsset({
        boardId,
        file: {
          buffer: pngBuffer,
          originalname: 'test.png',
          mimetype: 'image/jpeg', // declared jpeg but is png
          size: pngBuffer.length,
        },
      })
    ).rejects.toThrow(AssetError);
  });

  it('rejects upload to nonexistent board', async () => {
    const pngBuffer = await createTestPng();
    await expect(
      uploadAsset({
        boardId: '00000000-0000-0000-0000-000000000099',
        file: {
          buffer: pngBuffer,
          originalname: 'test.png',
          mimetype: 'image/png',
          size: pngBuffer.length,
        },
      })
    ).rejects.toThrow();
  });
});

describe('getAssetMetadata', () => {
  it('returns metadata for existing asset', async () => {
    const pngBuffer = await createTestPng();
    const { asset } = await uploadAsset({
      boardId,
      file: {
        buffer: pngBuffer,
        originalname: 'meta.png',
        mimetype: 'image/png',
        size: pngBuffer.length,
      },
    });

    const metadata = await getAssetMetadata(asset.id);
    expect(metadata.id).toBe(asset.id);
    expect(metadata.mimeType).toBe('image/png');
  });

  it('throws AssetNotFoundError for unknown ID', async () => {
    await expect(
      getAssetMetadata('00000000-0000-0000-0000-000000000099')
    ).rejects.toThrow(AssetNotFoundError);
  });
});
