import { describe, it, expect } from 'vitest';
import {
  validateBatchSize,
  validateNoDuplicateTempIds,
  BatchValidationError,
} from '../../src/domain/validation/batch-rules.js';

describe('validateBatchSize', () => {
  it('accepts 1 operation', () => {
    expect(() => validateBatchSize([{ type: 'create' }])).not.toThrow();
  });

  it('accepts 200 operations', () => {
    const ops = Array.from({ length: 200 }, () => ({ type: 'update' }));
    expect(() => validateBatchSize(ops)).not.toThrow();
  });

  it('rejects 0 operations', () => {
    expect(() => validateBatchSize([])).toThrow(BatchValidationError);
    try {
      validateBatchSize([]);
    } catch (e) {
      const err = e as BatchValidationError;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details.count).toBe(0);
    }
  });

  it('rejects 201 operations', () => {
    const ops = Array.from({ length: 201 }, () => ({ type: 'delete' }));
    expect(() => validateBatchSize(ops)).toThrow(BatchValidationError);
    try {
      validateBatchSize(ops);
    } catch (e) {
      const err = e as BatchValidationError;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details.count).toBe(201);
    }
  });
});

describe('validateNoDuplicateTempIds', () => {
  it('accepts unique tempIds', () => {
    const ops = [
      { type: 'create', tempId: 'tmp-1' },
      { type: 'create', tempId: 'tmp-2' },
      { type: 'create', tempId: 'tmp-3' },
    ];
    expect(() => validateNoDuplicateTempIds(ops)).not.toThrow();
  });

  it('rejects duplicate tempIds', () => {
    const ops = [
      { type: 'create', tempId: 'tmp-1' },
      { type: 'create', tempId: 'tmp-1' },
    ];
    expect(() => validateNoDuplicateTempIds(ops)).toThrow(BatchValidationError);
    try {
      validateNoDuplicateTempIds(ops);
    } catch (e) {
      const err = e as BatchValidationError;
      expect(err.details.tempId).toBe('tmp-1');
    }
  });

  it('handles batches with no create operations', () => {
    const ops = [
      { type: 'update', nodeId: 'abc' },
      { type: 'delete', nodeId: 'def' },
    ];
    expect(() => validateNoDuplicateTempIds(ops)).not.toThrow();
  });

  it('ignores tempIds on non-create operations', () => {
    const ops = [
      { type: 'update', tempId: 'tmp-1' },
      { type: 'create', tempId: 'tmp-1' },
    ];
    // Only create operations are scanned
    expect(() => validateNoDuplicateTempIds(ops)).not.toThrow();
  });
});
