import { describe, it, expect } from 'vitest';
import { TempIdMap } from '../../src/domain/ids/temp-id-map.js';

describe('TempIdMap', () => {
  it('register stores mapping and resolve returns realId', () => {
    const map = new TempIdMap();
    map.register('tmp-1', 'real-uuid-1');
    expect(map.resolve('tmp-1')).toBe('real-uuid-1');
  });

  it('resolve returns input unchanged for non-temp ID', () => {
    const map = new TempIdMap();
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(map.resolve(uuid)).toBe(uuid);
  });

  it('has returns true for registered tempId', () => {
    const map = new TempIdMap();
    map.register('tmp-1', 'real-uuid-1');
    expect(map.has('tmp-1')).toBe(true);
  });

  it('has returns false for unregistered tempId', () => {
    const map = new TempIdMap();
    expect(map.has('tmp-1')).toBe(false);
  });

  it('register throws on duplicate tempId', () => {
    const map = new TempIdMap();
    map.register('tmp-1', 'real-uuid-1');
    expect(() => map.register('tmp-1', 'real-uuid-2')).toThrow('TempId already registered: tmp-1');
  });

  it('resolve with unregistered temp-looking ID returns it unchanged', () => {
    const map = new TempIdMap();
    expect(map.resolve('tmp-99')).toBe('tmp-99');
  });

  it('supports multiple registrations', () => {
    const map = new TempIdMap();
    map.register('tmp-1', 'real-1');
    map.register('tmp-2', 'real-2');
    map.register('tmp-3', 'real-3');
    expect(map.resolve('tmp-1')).toBe('real-1');
    expect(map.resolve('tmp-2')).toBe('real-2');
    expect(map.resolve('tmp-3')).toBe('real-3');
  });
});
