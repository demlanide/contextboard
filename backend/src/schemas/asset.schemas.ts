import { z } from 'zod';

// ─── Upload Request ──────────────────────────────────────────────────────────

export const UploadAssetFieldsSchema = z.object({
  boardId: z.string().uuid(),
});

export type UploadAssetFields = z.infer<typeof UploadAssetFieldsSchema>;

// ─── Asset Response ──────────────────────────────────────────────────────────

export interface AssetResponse {
  id: string;
  boardId: string | null;
  kind: string;
  mimeType: string | null;
  originalFilename: string | null;
  url: string;
  thumbnailUrl: string | null;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  processingStatus: string;
  extractedText: string | null;
  aiCaption: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function mapAssetToResponse(row: AssetRow): AssetResponse {
  return {
    id: row.id,
    boardId: row.board_id,
    kind: row.kind,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    url: `/assets/${row.id}/file`,
    thumbnailUrl: row.thumbnail_storage_key ? `/assets/${row.id}/thumbnail` : null,
    fileSizeBytes: row.file_size_bytes,
    width: row.width,
    height: row.height,
    processingStatus: row.processing_status,
    extractedText: row.extracted_text,
    aiCaption: row.ai_caption,
    metadata: row.metadata,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

// ─── DB Row Type ─────────────────────────────────────────────────────────────

export interface AssetRow {
  id: string;
  board_id: string | null;
  kind: string;
  mime_type: string | null;
  original_filename: string | null;
  storage_key: string;
  thumbnail_storage_key: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  processing_status: string;
  extracted_text: string | null;
  ai_caption: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}
