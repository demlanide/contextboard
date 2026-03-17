import { describe, it, expect } from 'vitest';
import {
  assertEdgeExists,
  assertEdgeActive,
  assertEndpointsExist,
  assertEndpointsActive,
  assertEndpointsSameBoard,
  assertNotSelfLoop,
  EdgeError,
  EdgeNotFoundError,
  InvalidEdgeReferenceError,
} from '../../src/domain/validation/edge-rules.js';
import type { Edge, Node } from '../../src/schemas/board-state.schemas.js';

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    boardId: '00000000-0000-0000-0000-000000000010',
    sourceNodeId: '00000000-0000-0000-0000-000000000002',
    targetNodeId: '00000000-0000-0000-0000-000000000003',
    label: null,
    style: {},
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    boardId: '00000000-0000-0000-0000-000000000010',
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

describe('assertEdgeExists', () => {
  it('throws EdgeNotFoundError for null', () => {
    expect(() => assertEdgeExists(null)).toThrow(EdgeNotFoundError);
  });

  it('does not throw for an active edge', () => {
    expect(() => assertEdgeExists(makeEdge())).not.toThrow();
  });
});

describe('assertEdgeActive', () => {
  it('does not throw for edge without deletedAt', () => {
    expect(() => assertEdgeActive(makeEdge())).not.toThrow();
  });

  it('throws EdgeNotFoundError for edge with deletedAt set', () => {
    const edge = makeEdge() as Edge & { deletedAt?: string };
    edge.deletedAt = '2026-01-01T00:00:00.000Z';
    expect(() => assertEdgeActive(edge)).toThrow(EdgeNotFoundError);
  });
});

describe('assertEndpointsExist', () => {
  it('throws InvalidEdgeReferenceError if source is null', () => {
    expect(() => assertEndpointsExist(null, makeNode())).toThrow(InvalidEdgeReferenceError);
  });

  it('throws InvalidEdgeReferenceError if target is null', () => {
    expect(() => assertEndpointsExist(makeNode(), null)).toThrow(InvalidEdgeReferenceError);
  });

  it('throws InvalidEdgeReferenceError if both are null', () => {
    expect(() => assertEndpointsExist(null, null)).toThrow(InvalidEdgeReferenceError);
  });

  it('does not throw if both exist', () => {
    expect(() => assertEndpointsExist(makeNode(), makeNode())).not.toThrow();
  });
});

describe('assertEndpointsActive', () => {
  it('does not throw for active nodes', () => {
    expect(() => assertEndpointsActive(makeNode(), makeNode())).not.toThrow();
  });

  it('throws InvalidEdgeReferenceError if source has deletedAt', () => {
    const src = makeNode() as Node & { deletedAt?: string };
    src.deletedAt = '2026-01-01T00:00:00.000Z';
    expect(() => assertEndpointsActive(src, makeNode())).toThrow(InvalidEdgeReferenceError);
  });

  it('throws InvalidEdgeReferenceError if target has deletedAt', () => {
    const tgt = makeNode() as Node & { deletedAt?: string };
    tgt.deletedAt = '2026-01-01T00:00:00.000Z';
    expect(() => assertEndpointsActive(makeNode(), tgt)).toThrow(InvalidEdgeReferenceError);
  });
});

describe('assertEndpointsSameBoard', () => {
  const boardId = '00000000-0000-0000-0000-000000000010';

  it('does not throw when both nodes belong to the board', () => {
    expect(() =>
      assertEndpointsSameBoard(boardId, makeNode({ boardId }), makeNode({ boardId }))
    ).not.toThrow();
  });

  it('throws InvalidEdgeReferenceError if source boardId differs', () => {
    expect(() =>
      assertEndpointsSameBoard(
        boardId,
        makeNode({ boardId: '00000000-0000-0000-0000-000000000099' }),
        makeNode({ boardId })
      )
    ).toThrow(InvalidEdgeReferenceError);
  });

  it('throws InvalidEdgeReferenceError if target boardId differs', () => {
    expect(() =>
      assertEndpointsSameBoard(
        boardId,
        makeNode({ boardId }),
        makeNode({ boardId: '00000000-0000-0000-0000-000000000099' })
      )
    ).toThrow(InvalidEdgeReferenceError);
  });
});

describe('assertNotSelfLoop', () => {
  it('throws EdgeError with VALIDATION_ERROR when same IDs', () => {
    const id = '00000000-0000-0000-0000-000000000001';
    expect(() => assertNotSelfLoop(id, id)).toThrow(EdgeError);
    try {
      assertNotSelfLoop(id, id);
    } catch (err) {
      expect((err as EdgeError).code).toBe('VALIDATION_ERROR');
    }
  });

  it('does not throw when IDs are different', () => {
    expect(() =>
      assertNotSelfLoop(
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002'
      )
    ).not.toThrow();
  });
});
