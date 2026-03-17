import { describe, it, expect } from 'vitest';
import { applyMergePatch } from '../../src/domain/patch/merge-patch.js';

describe('applyMergePatch', () => {
  it('overwrites scalar values', () => {
    const result = applyMergePatch({ a: 1 }, { a: 2 });
    expect(result).toEqual({ a: 2 });
  });

  it('removes key when patch value is null', () => {
    const result = applyMergePatch({ a: 1, b: 2 }, { a: null });
    expect(result).toEqual({ b: 2 });
  });

  it('preserves keys absent from patch', () => {
    const result = applyMergePatch({ a: 1, b: 2 }, { a: 3 });
    expect(result).toEqual({ a: 3, b: 2 });
  });

  it('recursively merges nested objects', () => {
    const result = applyMergePatch(
      { nested: { a: 1, b: 2 } },
      { nested: { a: 10 } }
    );
    expect(result).toEqual({ nested: { a: 10, b: 2 } });
  });

  it('replaces arrays entirely', () => {
    const result = applyMergePatch({ arr: [1, 2, 3] }, { arr: [4, 5] });
    expect(result).toEqual({ arr: [4, 5] });
  });

  it('returns copy of target for empty patch', () => {
    const target = { a: 1, b: 2 };
    const result = applyMergePatch(target, {});
    expect(result).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(target);
  });

  it('removes nested key with null', () => {
    const result = applyMergePatch(
      { nested: { a: 1, b: 2 } },
      { nested: { b: null } }
    );
    expect(result).toEqual({ nested: { a: 1 } });
  });

  it('deeply nested merge', () => {
    const result = applyMergePatch(
      { a: { b: { c: 1, d: 2 }, e: 3 } },
      { a: { b: { c: 10 } } }
    );
    expect(result).toEqual({ a: { b: { c: 10, d: 2 }, e: 3 } });
  });

  it('does not mutate inputs', () => {
    const target = { a: 1, nested: { b: 2 } };
    const patch = { a: 10, nested: { c: 3 } };
    const targetCopy = JSON.parse(JSON.stringify(target));
    const patchCopy = JSON.parse(JSON.stringify(patch));

    applyMergePatch(target, patch);

    expect(target).toEqual(targetCopy);
    expect(patch).toEqual(patchCopy);
  });

  it('adds new keys from patch', () => {
    const result = applyMergePatch({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });
});
