// T042: Simple in-memory rate limiter
import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../../schemas/common.schemas.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimit(maxRequests: number, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Key by IP + path pattern
    const key = `${req.ip ?? 'unknown'}:${req.route?.path ?? req.path}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      return res.status(429).json(
        errorResponse(
          'RATE_LIMIT_EXCEEDED',
          `Too many requests. Maximum ${maxRequests} per minute.`
        )
      );
    }

    next();
  };
}
