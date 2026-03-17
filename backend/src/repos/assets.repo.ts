import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { AssetRow } from '../schemas/asset.schemas.js';

function mapAssetRow(row: Record<string, unknown>): AssetRow {
  return {
    id: row.id as string,
    board_id: row.board_id as string | null,
    kind: row.kind as string,
    mime_type: row.mime_type as string | null,
    original_filename: row.original_filename as string | null,
    storage_key: row.storage_key as string,
    thumbnail_storage_key: row.thumbnail_storage_key as string | null,
    file_size_bytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    width: row.width as number | null,
    height: row.height as number | null,
    processing_status: row.processing_status as string,
    extracted_text: row.extracted_text as string | null,
    ai_caption: row.ai_caption as string | null,
    metadata: row.metadata as Record<string, unknown>,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export interface InsertAssetParams {
  boardId: string;
  kind: string;
  mimeType: string | null;
  originalFilename: string | null;
  storageKey: string;
  thumbnailStorageKey: string | null;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  processingStatus?: string;
  metadata?: Record<string, unknown>;
}

export async function insertAsset(
  client: PoolClient,
  params: InsertAssetParams
): Promise<AssetRow> {
  const id = uuidv4();
  const { rows } = await client.query(
    `INSERT INTO assets (id, board_id, kind, mime_type, original_filename, storage_key, thumbnail_storage_key, file_size_bytes, width, height, processing_status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      params.boardId,
      params.kind,
      params.mimeType,
      params.originalFilename,
      params.storageKey,
      params.thumbnailStorageKey,
      params.fileSizeBytes,
      params.width,
      params.height,
      params.processingStatus ?? 'ready',
      JSON.stringify(params.metadata ?? {}),
    ]
  );
  return mapAssetRow(rows[0]);
}

export async function findById(
  client: PoolClient,
  assetId: string
): Promise<AssetRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM assets WHERE id = $1`,
    [assetId]
  );
  if (rows.length === 0) return null;
  return mapAssetRow(rows[0]);
}

export async function findByBoardId(
  client: PoolClient,
  boardId: string
): Promise<AssetRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM assets WHERE board_id = $1 ORDER BY created_at ASC`,
    [boardId]
  );
  return rows.map(mapAssetRow);
}
