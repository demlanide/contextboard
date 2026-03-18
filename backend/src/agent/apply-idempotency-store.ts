import type { ApplyResponse } from '../schemas/agent.schemas.js';

interface StoredEntry {
  result: ApplyResponse;
  expiresAt: number;
}

export interface ApplyIdempotencyStore {
  get(key: string): ApplyResponse | null;
  set(key: string, result: ApplyResponse, ttlMs: number): void;
}

export function createApplyIdempotencyStore(): ApplyIdempotencyStore {
  const store = new Map<string, StoredEntry>();

  return {
    get(key: string): ApplyResponse | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.result;
    },

    set(key: string, result: ApplyResponse, ttlMs: number): void {
      store.set(key, { result, expiresAt: Date.now() + ttlMs });

      // Lazy cleanup of expired entries
      if (store.size > 1000) {
        const now = Date.now();
        for (const [k, v] of store) {
          if (now > v.expiresAt) store.delete(k);
        }
      }
    },
  };
}
