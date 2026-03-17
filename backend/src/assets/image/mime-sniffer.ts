import { fileTypeFromBuffer } from 'file-type';

export interface SniffResult {
  detectedMime: string;
}

/**
 * Detect the actual MIME type of a buffer using magic bytes.
 * Returns null if the file type cannot be determined.
 */
export async function sniffMimeType(buffer: Buffer): Promise<SniffResult | null> {
  const result = await fileTypeFromBuffer(buffer);
  if (!result) return null;
  return { detectedMime: result.mime };
}
