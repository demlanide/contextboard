import { describe, it, expect } from 'vitest';
import {
  validateUploadSize,
  validateMimeType,
  validateAssetForImageNode,
  AssetError,
  type AssetRecord,
} from '../../src/domain/validation/asset-rules.js';

describe('validateUploadSize', () => {
  it('accepts image under 20 MB', () => {
    expect(() => validateUploadSize(10 * 1024 * 1024, true)).not.toThrow();
  });

  it('rejects image over 20 MB', () => {
    expect(() => validateUploadSize(21 * 1024 * 1024, true)).toThrow(AssetError);
  });

  it('accepts file under 50 MB', () => {
    expect(() => validateUploadSize(40 * 1024 * 1024, false)).not.toThrow();
  });

  it('rejects file over 50 MB', () => {
    expect(() => validateUploadSize(51 * 1024 * 1024, false)).toThrow(AssetError);
  });

  it('accepts exact image limit', () => {
    expect(() => validateUploadSize(20 * 1024 * 1024, true)).not.toThrow();
  });
});

describe('validateMimeType', () => {
  it('accepts matching image/png', () => {
    expect(() => validateMimeType('image/png', 'image/png')).not.toThrow();
  });

  it('rejects null detected MIME', () => {
    expect(() => validateMimeType('image/png', null)).toThrow(AssetError);
  });

  it('rejects MIME not in allowed list', () => {
    expect(() => validateMimeType('application/pdf', 'application/pdf')).toThrow(AssetError);
  });

  it('rejects mismatched declared vs detected', () => {
    expect(() => validateMimeType('image/png', 'image/jpeg')).toThrow(AssetError);
  });

  it('accepts all allowed types', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(() => validateMimeType(mime, mime)).not.toThrow();
    }
  });
});

describe('validateAssetForImageNode', () => {
  const boardId = '00000000-0000-0000-0000-000000000001';

  function makeAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
    return {
      id: '00000000-0000-0000-0000-000000000010',
      board_id: boardId,
      processing_status: 'ready',
      ...overrides,
    };
  }

  it('accepts asset with ready status and same board', () => {
    expect(() => validateAssetForImageNode(makeAsset(), boardId)).not.toThrow();
  });

  it('rejects null asset', () => {
    expect(() => validateAssetForImageNode(null, boardId)).toThrow(AssetError);
  });

  it('rejects asset with pending status', () => {
    expect(() =>
      validateAssetForImageNode(makeAsset({ processing_status: 'pending' }), boardId)
    ).toThrow(AssetError);
  });

  it('rejects asset with failed status', () => {
    expect(() =>
      validateAssetForImageNode(makeAsset({ processing_status: 'failed' }), boardId)
    ).toThrow(AssetError);
  });

  it('rejects asset from different board', () => {
    expect(() =>
      validateAssetForImageNode(
        makeAsset({ board_id: '00000000-0000-0000-0000-000000000099' }),
        boardId
      )
    ).toThrow(AssetError);
  });
});
