import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { sniffMimeType } from '../../src/assets/image/mime-sniffer.js';

// Create real minimal images for reliable detection
async function createPng(): Promise<Buffer> {
  return sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
}
async function createJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer();
}
async function createWebp(): Promise<Buffer> {
  return sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } } }).webp().toBuffer();
}
async function createGif(): Promise<Buffer> {
  return sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } } }).gif().toBuffer();
}

describe('sniffMimeType', () => {
  it('detects PNG', async () => {
    const buffer = await createPng();
    const result = await sniffMimeType(buffer);
    expect(result).not.toBeNull();
    expect(result!.detectedMime).toBe('image/png');
  });

  it('detects JPEG', async () => {
    const buffer = await createJpeg();
    const result = await sniffMimeType(buffer);
    expect(result).not.toBeNull();
    expect(result!.detectedMime).toBe('image/jpeg');
  });

  it('detects WebP', async () => {
    const buffer = await createWebp();
    const result = await sniffMimeType(buffer);
    expect(result).not.toBeNull();
    expect(result!.detectedMime).toBe('image/webp');
  });

  it('detects GIF', async () => {
    const buffer = await createGif();
    const result = await sniffMimeType(buffer);
    expect(result).not.toBeNull();
    expect(result!.detectedMime).toBe('image/gif');
  });

  it('returns null for unrecognizable content', async () => {
    const buffer = Buffer.from('this is just plain text');
    const result = await sniffMimeType(buffer);
    expect(result).toBeNull();
  });

  it('returns null for empty buffer', async () => {
    const buffer = Buffer.alloc(0);
    const result = await sniffMimeType(buffer);
    expect(result).toBeNull();
  });
});
