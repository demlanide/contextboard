import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { generateThumbnail } from '../../src/assets/image/thumbnail-generator.js';

async function createTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

describe('generateThumbnail', () => {
  it('generates a WebP thumbnail within bounding box', async () => {
    const image = await createTestImage(800, 600);
    const thumb = await generateThumbnail(image, 400);

    const metadata = await sharp(thumb).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(400);
    expect(metadata.height).toBeLessThanOrEqual(400);
  });

  it('preserves aspect ratio for landscape image', async () => {
    const image = await createTestImage(800, 400);
    const thumb = await generateThumbnail(image, 400);

    const metadata = await sharp(thumb).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(200);
  });

  it('preserves aspect ratio for portrait image', async () => {
    const image = await createTestImage(300, 600);
    const thumb = await generateThumbnail(image, 400);

    const metadata = await sharp(thumb).metadata();
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(400);
  });

  it('does not upscale small images beyond their original size', async () => {
    const image = await createTestImage(100, 80);
    const thumb = await generateThumbnail(image, 400);

    const metadata = await sharp(thumb).metadata();
    // sharp resize with fit:inside does not upscale by default
    expect(metadata.width).toBeLessThanOrEqual(100);
    expect(metadata.height).toBeLessThanOrEqual(80);
  });

  it('rejects corrupted/invalid input', async () => {
    const garbage = Buffer.from('not an image at all');
    await expect(generateThumbnail(garbage, 400)).rejects.toThrow();
  });
});
