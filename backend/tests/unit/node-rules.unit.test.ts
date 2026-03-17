import { describe, it, expect } from 'vitest';
import {
  assertNodeExists,
  assertNodeNotLocked,
  validateNodeContent,
  NodeNotFoundError,
  NodeLockedError,
  NodeError,
} from '../../src/domain/validation/node-rules.js';
import type { Node } from '../../src/schemas/board-state.schemas.js';

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    boardId: '00000000-0000-0000-0000-000000000002',
    type: 'sticky',
    parentId: null,
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    rotation: 0,
    zIndex: 0,
    content: { text: 'hello' },
    style: {},
    metadata: {},
    locked: false,
    hidden: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('assertNodeExists', () => {
  it('throws NodeNotFoundError for null', () => {
    expect(() => assertNodeExists(null)).toThrow(NodeNotFoundError);
  });

  it('does not throw for an active node', () => {
    expect(() => assertNodeExists(makeNode())).not.toThrow();
  });
});

describe('assertNodeNotLocked', () => {
  it('throws NodeLockedError for locked=true', () => {
    expect(() => assertNodeNotLocked(makeNode({ locked: true }))).toThrow(NodeLockedError);
  });

  it('does not throw for locked=false', () => {
    expect(() => assertNodeNotLocked(makeNode({ locked: false }))).not.toThrow();
  });
});

describe('validateNodeContent', () => {
  // Sticky
  describe('sticky', () => {
    it('accepts valid text', () => {
      expect(() => validateNodeContent('sticky', { text: 'hello' })).not.toThrow();
    });

    it('rejects missing text', () => {
      expect(() => validateNodeContent('sticky', {})).toThrow(NodeError);
    });

    it('rejects empty text', () => {
      expect(() => validateNodeContent('sticky', { text: '' })).toThrow(NodeError);
    });

    it('rejects text over limit', () => {
      expect(() => validateNodeContent('sticky', { text: 'a'.repeat(20_001) })).toThrow(NodeError);
    });

    it('accepts text at max limit', () => {
      expect(() => validateNodeContent('sticky', { text: 'a'.repeat(20_000) })).not.toThrow();
    });
  });

  // Text
  describe('text', () => {
    it('accepts text with optional title', () => {
      expect(() => validateNodeContent('text', { text: 'body', title: 'Title' })).not.toThrow();
    });

    it('accepts text without title', () => {
      expect(() => validateNodeContent('text', { text: 'body' })).not.toThrow();
    });

    it('rejects missing text', () => {
      expect(() => validateNodeContent('text', { title: 'Title' })).toThrow(NodeError);
    });

    it('rejects title over 500 chars', () => {
      expect(() =>
        validateNodeContent('text', { text: 'body', title: 'a'.repeat(501) })
      ).toThrow(NodeError);
    });

    it('accepts title at 500 chars', () => {
      expect(() =>
        validateNodeContent('text', { text: 'body', title: 'a'.repeat(500) })
      ).not.toThrow();
    });
  });

  // Shape
  describe('shape', () => {
    it('accepts rectangle with no text', () => {
      expect(() => validateNodeContent('shape', { shapeType: 'rectangle' })).not.toThrow();
    });

    it('accepts ellipse with text', () => {
      expect(() =>
        validateNodeContent('shape', { shapeType: 'ellipse', text: 'label' })
      ).not.toThrow();
    });

    it('accepts diamond', () => {
      expect(() => validateNodeContent('shape', { shapeType: 'diamond' })).not.toThrow();
    });

    it('rejects invalid shapeType', () => {
      expect(() => validateNodeContent('shape', { shapeType: 'triangle' })).toThrow(NodeError);
    });

    it('rejects missing shapeType', () => {
      expect(() => validateNodeContent('shape', {})).toThrow(NodeError);
    });

    it('rejects shape text over 5000 chars', () => {
      expect(() =>
        validateNodeContent('shape', { shapeType: 'rectangle', text: 'a'.repeat(5_001) })
      ).toThrow(NodeError);
    });
  });

  // Image
  describe('image', () => {
    it('accepts valid UUID assetId', () => {
      expect(() =>
        validateNodeContent('image', { assetId: '00000000-0000-0000-0000-000000000001' })
      ).not.toThrow();
    });

    it('rejects missing assetId', () => {
      expect(() => validateNodeContent('image', {})).toThrow(NodeError);
    });

    it('rejects non-UUID assetId', () => {
      expect(() => validateNodeContent('image', { assetId: 'not-a-uuid' })).toThrow(NodeError);
    });
  });
});
