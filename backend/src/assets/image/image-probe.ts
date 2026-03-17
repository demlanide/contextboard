import sharp from 'sharp';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Extract width and height from an image buffer using sharp metadata.
 * Returns null if the buffer is not a valid image or dimensions cannot be read.
 */
export async function probeImageDimensions(buffer: Buffer): Promise<ImageDimensions | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch {
    return null;
  }
}
