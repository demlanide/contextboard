import sharp from 'sharp';

/**
 * Generate a WebP thumbnail that fits within a maxDim x maxDim bounding box,
 * preserving aspect ratio. Returns the thumbnail buffer.
 * Throws if the image is corrupted or cannot be processed.
 */
export async function generateThumbnail(buffer: Buffer, maxDim: number): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .toFormat('webp')
    .toBuffer();
}
