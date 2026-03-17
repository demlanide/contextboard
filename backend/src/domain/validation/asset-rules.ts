import { limits } from '../../config/limits.js';

// ─── Error Classes ───────────────────────────────────────────────────────────

export class AssetError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AssetError';
  }
}

export class AssetNotFoundError extends AssetError {
  constructor() {
    super('ASSET_NOT_FOUND', 'Asset not found');
  }
}

export class AssetThumbnailNotAvailableError extends AssetError {
  constructor() {
    super('ASSET_THUMBNAIL_NOT_AVAILABLE', 'Thumbnail not available for this asset');
  }
}

// ─── Validation Functions ────────────────────────────────────────────────────

export function validateUploadSize(fileSizeBytes: number, isImage: boolean): void {
  const limit = isImage ? limits.asset.imageMaxSizeBytes : limits.asset.fileMaxSizeBytes;
  if (fileSizeBytes > limit) {
    throw new AssetError(
      'PAYLOAD_TOO_LARGE',
      `File size ${fileSizeBytes} bytes exceeds limit of ${limit} bytes`
    );
  }
}

export function validateMimeType(
  declaredMime: string,
  detectedMime: string | null
): void {
  if (!detectedMime) {
    throw new AssetError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Could not detect file type from content'
    );
  }

  if (!limits.asset.allowedMimeTypes.includes(detectedMime)) {
    throw new AssetError(
      'UNSUPPORTED_MEDIA_TYPE',
      `File type ${detectedMime} is not allowed`
    );
  }

  // Normalize MIME for comparison (e.g., image/jpeg vs image/jpg)
  if (declaredMime !== detectedMime) {
    throw new AssetError(
      'UNSUPPORTED_MEDIA_TYPE',
      `Declared MIME type ${declaredMime} does not match detected type ${detectedMime}`
    );
  }
}

export interface AssetRecord {
  id: string;
  board_id: string | null;
  processing_status: string;
}

export function validateAssetForImageNode(
  asset: AssetRecord | null,
  boardId: string
): void {
  if (!asset) {
    throw new AssetError('VALIDATION_ERROR', 'Referenced asset does not exist');
  }

  if (asset.processing_status !== 'ready') {
    throw new AssetError(
      'VALIDATION_ERROR',
      `Asset processingStatus is "${asset.processing_status}", must be "ready"`
    );
  }

  if (asset.board_id !== boardId) {
    throw new AssetError(
      'VALIDATION_ERROR',
      'Asset belongs to a different board'
    );
  }
}
