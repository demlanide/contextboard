import { v4 as uuidv4 } from 'uuid';
import { withBoardMutation } from '../db/tx.js';
import { withTransaction } from '../db/tx.js';
import { assertBoardEditable } from '../domain/validation/board-rules.js';
import { validateUploadSize, validateMimeType, AssetError, AssetNotFoundError, AssetThumbnailNotAvailableError } from '../domain/validation/asset-rules.js';
import { sniffMimeType } from '../assets/image/mime-sniffer.js';
import { probeImageDimensions } from '../assets/image/image-probe.js';
import { generateThumbnail } from '../assets/image/thumbnail-generator.js';
import { insertAsset, findById } from '../repos/assets.repo.js';
import { buildOperation } from '../domain/operations/operation-factory.js';
import { mapAssetToResponse, type AssetResponse, type AssetRow } from '../schemas/asset.schemas.js';
import { limits } from '../config/limits.js';
import { logger } from '../obs/logger.js';
import type { AssetStorage } from '../assets/storage/storage.interface.js';

let storageInstance: AssetStorage | null = null;

export function setAssetStorage(storage: AssetStorage): void {
  storageInstance = storage;
}

function getStorage(): AssetStorage {
  if (!storageInstance) {
    throw new Error('Asset storage not initialized. Call setAssetStorage() first.');
  }
  return storageInstance;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface UploadAssetInput {
  boardId: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}

export async function uploadAsset(
  input: UploadAssetInput
): Promise<{ asset: AssetResponse; boardRevision: number }> {
  const { boardId, file } = input;
  const storage = getStorage();

  // Determine if this is an image based on detected content
  const sniffResult = await sniffMimeType(file.buffer);
  const detectedMime = sniffResult?.detectedMime ?? null;
  const isImage = detectedMime?.startsWith('image/') ?? false;

  // Validate size
  validateUploadSize(file.size, isImage);

  // Validate MIME type
  validateMimeType(file.mimetype, detectedMime);

  // Probe dimensions for images
  let width: number | null = null;
  let height: number | null = null;
  if (isImage) {
    const dims = await probeImageDimensions(file.buffer);
    if (!dims) {
      throw new AssetError('VALIDATION_ERROR', 'Could not extract image dimensions — file may be corrupted');
    }
    width = dims.width;
    height = dims.height;
  }

  // Generate thumbnail for images
  let thumbnailBuffer: Buffer | null = null;
  if (isImage) {
    try {
      thumbnailBuffer = await generateThumbnail(file.buffer, limits.asset.thumbnailMaxDim);
    } catch {
      throw new AssetError('VALIDATION_ERROR', 'Failed to generate thumbnail — file may be corrupted');
    }
  }

  // Build storage keys
  const assetId = uuidv4();
  const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `${boardId}/${assetId}/${sanitizedName}`;
  const thumbnailStorageKey = thumbnailBuffer
    ? `${boardId}/${assetId}/thumb/${sanitizedName}.webp`
    : null;

  // Store blobs
  await storage.putObject({
    key: storageKey,
    body: file.buffer,
    contentType: detectedMime!,
  });

  if (thumbnailBuffer && thumbnailStorageKey) {
    await storage.putObject({
      key: thumbnailStorageKey,
      body: thumbnailBuffer,
      contentType: 'image/webp',
    });
  }

  // DB transaction: insert metadata + operation + revision bump
  try {
    const result = await withBoardMutation(boardId, async ({ client, board }) => {
      assertBoardEditable(board);

      const assetRow = await insertAsset(client, {
        boardId,
        kind: isImage ? 'image' : 'file',
        mimeType: detectedMime,
        originalFilename: file.originalname,
        storageKey,
        thumbnailStorageKey,
        fileSizeBytes: file.size,
        width,
        height,
        processingStatus: 'ready',
      });

      const newRevision = board.revision + 1;

      const op = buildOperation({
        boardId,
        boardRevision: newRevision,
        actorType: 'user',
        operationType: 'create_asset',
        targetType: 'asset',
        targetId: assetRow.id,
        payload: {
          asset: {
            id: assetRow.id,
            boardId,
            kind: assetRow.kind,
            mimeType: assetRow.mime_type,
            fileSizeBytes: assetRow.file_size_bytes,
            width: assetRow.width,
            height: assetRow.height,
            storageKey: assetRow.storage_key,
          },
        },
      });

      logger.info('Asset uploaded', {
        boardId,
        assetId: assetRow.id,
        mimeType: detectedMime,
        fileSizeBytes: file.size,
        hasThumbnail: !!thumbnailStorageKey,
      });

      return {
        result: { asset: mapAssetToResponse(assetRow), boardRevision: newRevision },
        operations: [op],
        newRevision,
      };
    });

    return result;
  } catch (err) {
    // Rollback: clean up stored blobs on DB failure
    await storage.deleteObject(storageKey).catch(() => {});
    if (thumbnailStorageKey) {
      await storage.deleteObject(thumbnailStorageKey).catch(() => {});
    }
    throw err;
  }
}

// ─── Get Metadata ────────────────────────────────────────────────────────────

export async function getAssetMetadata(assetId: string): Promise<AssetResponse> {
  return withTransaction(async (client) => {
    const row = await findById(client, assetId);
    if (!row) throw new AssetNotFoundError();
    return mapAssetToResponse(row);
  });
}

// ─── Get File Stream ─────────────────────────────────────────────────────────

export async function getAssetFile(
  assetId: string
): Promise<{ stream: import('node:stream').Readable; contentType: string }> {
  const storage = getStorage();

  const metadata = await withTransaction(async (client) => {
    const row = await findById(client, assetId);
    if (!row) throw new AssetNotFoundError();
    return row;
  });

  try {
    const { stream } = await storage.getObjectStream(metadata.storage_key);
    return { stream, contentType: metadata.mime_type ?? 'application/octet-stream' };
  } catch {
    throw new AssetError('INTERNAL_ERROR', 'Asset blob not found in storage');
  }
}

// ─── Get Thumbnail Stream ────────────────────────────────────────────────────

export async function getAssetThumbnail(
  assetId: string
): Promise<{ stream: import('node:stream').Readable; contentType: string }> {
  const storage = getStorage();

  const metadata = await withTransaction(async (client) => {
    const row = await findById(client, assetId);
    if (!row) throw new AssetNotFoundError();
    return row;
  });

  if (!metadata.thumbnail_storage_key) {
    throw new AssetThumbnailNotAvailableError();
  }

  try {
    const { stream } = await storage.getObjectStream(metadata.thumbnail_storage_key);
    return { stream, contentType: 'image/webp' };
  } catch {
    throw new AssetError('INTERNAL_ERROR', 'Thumbnail blob not found in storage');
  }
}
