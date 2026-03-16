import { describe, it, expect } from 'vitest';
import { getNextRevision, shouldBumpRevision } from '../../src/domain/revision/revision-policy.js';

describe('getNextRevision', () => {
  it('returns 0 for create regardless of current', () => {
    expect(getNextRevision(0, 'create')).toBe(0);
    expect(getNextRevision(5, 'create')).toBe(0);
  });

  it('increments by 1 for update', () => {
    expect(getNextRevision(0, 'update')).toBe(1);
    expect(getNextRevision(3, 'update')).toBe(4);
  });

  it('increments by 1 for archive', () => {
    expect(getNextRevision(0, 'archive')).toBe(1);
    expect(getNextRevision(5, 'archive')).toBe(6);
  });

  it('does not change revision for delete', () => {
    expect(getNextRevision(0, 'delete')).toBe(0);
    expect(getNextRevision(7, 'delete')).toBe(7);
  });
});

describe('shouldBumpRevision', () => {
  it('returns true for update', () => {
    expect(shouldBumpRevision('update')).toBe(true);
  });

  it('returns true for archive', () => {
    expect(shouldBumpRevision('archive')).toBe(true);
  });

  it('returns false for create', () => {
    expect(shouldBumpRevision('create')).toBe(false);
  });

  it('returns false for delete', () => {
    expect(shouldBumpRevision('delete')).toBe(false);
  });
});
