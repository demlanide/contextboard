/**
 * Integration tests for image node creation with asset validation.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { pool } from '../../src/db/pool.js';
import { createBoard } from '../../src/services/boards.service.js';
import { createNode, deleteNode } from '../../src/services/nodes.service.js';
import { uploadAsset, getAssetMetadata, setAssetStorage } from '../../src/services/assets.service.js';
import { LocalAssetStorage } from '../../src/assets/storage/local-storage.js';
import { AssetError } from '../../src/domain/validation/asset-rules.js';
import { NodeError } from '../../src/domain/validation/node-rules.js';

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

async function createTestPng(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 150, channels: 3, background: { r: 0, g: 200, b: 0 } },
  })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  storagePath = await mkdtemp(resolve(tmpdir(), 'cb-test-imgnode-'));
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
  const { board } = await createBoard({ title: 'Image Node Test Board' });
  boardId = board.id;
});

describe('image node with asset validation', () => {
  it('creates image node with valid asset', async () => {
    const png = await createTestPng();
    const { asset } = await uploadAsset({
      boardId,
      file: { buffer: png, originalname: 'test.png', mimetype: 'image/png', size: png.length },
    });

    const result = await createNode(boardId, {
      type: 'image',
      x: 100,
      y: 200,
      width: 400,
      height: 300,
      content: { assetId: asset.id },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    expect(result.node.type).toBe('image');
    expect(result.node.content).toEqual({ assetId: asset.id });
    expect(result.boardRevision).toBeGreaterThan(0);
  });

  it('rejects image node with nonexistent assetId', async () => {
    await expect(
      createNode(boardId, {
        type: 'image',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        content: { assetId: '00000000-0000-0000-0000-000000000099' },
        parentId: null,
        rotation: 0,
        zIndex: 0,
        style: {},
        metadata: {},
      })
    ).rejects.toThrow(AssetError);
  });

  it('rejects image node with missing assetId', async () => {
    await expect(
      createNode(boardId, {
        type: 'image',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        content: {},
        parentId: null,
        rotation: 0,
        zIndex: 0,
        style: {},
        metadata: {},
      })
    ).rejects.toThrow(NodeError);
  });

  it('creates image node with caption', async () => {
    const png = await createTestPng();
    const { asset } = await uploadAsset({
      boardId,
      file: { buffer: png, originalname: 'cap.png', mimetype: 'image/png', size: png.length },
    });

    const result = await createNode(boardId, {
      type: 'image',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      content: { assetId: asset.id, caption: 'A test caption' },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    expect(result.node.content).toEqual({ assetId: asset.id, caption: 'A test caption' });
  });

  it('rejects caption exceeding 2000 chars', async () => {
    const png = await createTestPng();
    const { asset } = await uploadAsset({
      boardId,
      file: { buffer: png, originalname: 'cap2.png', mimetype: 'image/png', size: png.length },
    });

    await expect(
      createNode(boardId, {
        type: 'image',
        x: 0,
        y: 0,
        width: 200,
        height: 150,
        content: { assetId: asset.id, caption: 'a'.repeat(2001) },
        parentId: null,
        rotation: 0,
        zIndex: 0,
        style: {},
        metadata: {},
      })
    ).rejects.toThrow(NodeError);
  });

  it('preserves asset after image node deletion', async () => {
    const png = await createTestPng();
    const { asset } = await uploadAsset({
      boardId,
      file: { buffer: png, originalname: 'keep.png', mimetype: 'image/png', size: png.length },
    });

    const { node } = await createNode(boardId, {
      type: 'image',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      content: { assetId: asset.id },
      parentId: null,
      rotation: 0,
      zIndex: 0,
      style: {},
      metadata: {},
    });

    // Delete the node
    await deleteNode(node.id);

    // Asset should still exist
    const metadata = await getAssetMetadata(asset.id);
    expect(metadata.id).toBe(asset.id);
    expect(metadata.processingStatus).toBe('ready');
  });
});
