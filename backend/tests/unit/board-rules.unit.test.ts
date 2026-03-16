import { describe, it, expect } from 'vitest';
import {
  assertBoardExists,
  assertBoardEditable,
  validateStatusTransition,
  BoardNotFoundError,
  BoardValidationError,
} from '../../src/domain/validation/board-rules.js';

describe('assertBoardExists', () => {
  it('throws BoardNotFoundError when board is null', () => {
    expect(() => assertBoardExists(null)).toThrow(BoardNotFoundError);
  });

  it('throws BoardNotFoundError when board status is deleted', () => {
    expect(() => assertBoardExists({ status: 'deleted' })).toThrow(BoardNotFoundError);
  });

  it('does not throw for active board', () => {
    expect(() => assertBoardExists({ status: 'active' })).not.toThrow();
  });

  it('does not throw for archived board', () => {
    expect(() => assertBoardExists({ status: 'archived' })).not.toThrow();
  });
});

describe('assertBoardEditable', () => {
  it('throws BoardNotFoundError for deleted board', () => {
    expect(() => assertBoardEditable({ status: 'deleted' })).toThrow(BoardNotFoundError);
  });

  it('throws BoardValidationError for archived board', () => {
    expect(() => assertBoardEditable({ status: 'archived' })).toThrow(BoardValidationError);
  });

  it('does not throw for active board', () => {
    expect(() => assertBoardEditable({ status: 'active' })).not.toThrow();
  });
});

describe('validateStatusTransition', () => {
  it('allows active → archived', () => {
    expect(validateStatusTransition('active', 'archived')).toBe('archive');
  });

  it('rejects active → active with 422', () => {
    expect(() => validateStatusTransition('active', 'active')).toThrow(BoardValidationError);
  });

  it('rejects active → deleted with 422 (use DELETE endpoint)', () => {
    expect(() => validateStatusTransition('active', 'deleted')).toThrow(BoardValidationError);
  });

  it('rejects archived → active (un-archive not supported)', () => {
    expect(() => validateStatusTransition('archived', 'active')).toThrow(BoardValidationError);
  });

  it('rejects archived → archived (already archived)', () => {
    expect(() => validateStatusTransition('archived', 'archived')).toThrow(BoardValidationError);
  });

  it('throws BoardNotFoundError for deleted board', () => {
    expect(() => validateStatusTransition('deleted', 'archived')).toThrow(BoardNotFoundError);
  });
});
