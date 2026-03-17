import { describe, it, expect } from 'vitest';
import {
  validateMessageText,
  validateSelectionContext,
  assertBoardChatWritable,
  assertThreadExists,
  ChatValidationError,
  ChatThreadNotFoundError,
} from '../../src/domain/validation/chat-rules.js';
import { BoardNotFoundError, BoardError } from '../../src/domain/validation/board-rules.js';

describe('validateMessageText', () => {
  it('accepts a single character', () => {
    expect(() => validateMessageText('a')).not.toThrow();
  });

  it('accepts 20000 characters', () => {
    expect(() => validateMessageText('a'.repeat(20000))).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => validateMessageText('')).toThrow(ChatValidationError);
  });

  it('rejects string over 20000 characters', () => {
    expect(() => validateMessageText('a'.repeat(20001))).toThrow(ChatValidationError);
  });
});

describe('validateSelectionContext', () => {
  it('accepts undefined', () => {
    expect(() => validateSelectionContext(undefined)).not.toThrow();
  });

  it('accepts valid context with node and edge IDs', () => {
    expect(() =>
      validateSelectionContext({
        selectedNodeIds: ['123e4567-e89b-12d3-a456-426614174000'],
        selectedEdgeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      })
    ).not.toThrow();
  });

  it('accepts empty object', () => {
    expect(() => validateSelectionContext({})).not.toThrow();
  });

  it('rejects non-array selectedNodeIds', () => {
    expect(() =>
      validateSelectionContext({ selectedNodeIds: 'not-array' })
    ).toThrow(ChatValidationError);
  });

  it('rejects non-array selectedEdgeIds', () => {
    expect(() =>
      validateSelectionContext({ selectedEdgeIds: 42 })
    ).toThrow(ChatValidationError);
  });

  it('rejects selectedNodeIds over limit', () => {
    const ids = Array(101).fill('123e4567-e89b-12d3-a456-426614174000');
    expect(() =>
      validateSelectionContext({ selectedNodeIds: ids })
    ).toThrow(ChatValidationError);
  });

  it('rejects selectedEdgeIds over limit', () => {
    const ids = Array(101).fill('123e4567-e89b-12d3-a456-426614174000');
    expect(() =>
      validateSelectionContext({ selectedEdgeIds: ids })
    ).toThrow(ChatValidationError);
  });

  it('rejects viewport with non-numeric fields', () => {
    expect(() =>
      validateSelectionContext({ viewport: { x: 'a', y: 0, zoom: 1 } })
    ).toThrow(ChatValidationError);
  });

  it('rejects viewport with zero zoom', () => {
    expect(() =>
      validateSelectionContext({ viewport: { x: 0, y: 0, zoom: 0 } })
    ).toThrow(ChatValidationError);
  });

  it('rejects viewport with negative zoom', () => {
    expect(() =>
      validateSelectionContext({ viewport: { x: 0, y: 0, zoom: -1 } })
    ).toThrow(ChatValidationError);
  });
});

describe('assertBoardChatWritable', () => {
  it('throws BoardNotFoundError for null board', () => {
    expect(() => assertBoardChatWritable(null)).toThrow(BoardNotFoundError);
  });

  it('throws BoardNotFoundError for deleted board', () => {
    expect(() => assertBoardChatWritable({ status: 'deleted' })).toThrow(BoardNotFoundError);
  });

  it('throws BoardError with BOARD_ARCHIVED code for archived board', () => {
    expect(() => assertBoardChatWritable({ status: 'archived' })).toThrow(BoardError);
    try {
      assertBoardChatWritable({ status: 'archived' });
    } catch (err) {
      expect((err as BoardError).code).toBe('BOARD_ARCHIVED');
    }
  });

  it('does not throw for active board', () => {
    expect(() => assertBoardChatWritable({ status: 'active' })).not.toThrow();
  });
});

describe('assertThreadExists', () => {
  it('throws ChatThreadNotFoundError for null', () => {
    expect(() => assertThreadExists(null)).toThrow(ChatThreadNotFoundError);
  });

  it('does not throw for existing thread', () => {
    expect(() => assertThreadExists({ id: 'some-id' })).not.toThrow();
  });
});
