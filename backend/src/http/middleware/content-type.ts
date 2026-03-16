import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../../schemas/common.schemas.js';

/**
 * Enforces application/merge-patch+json content-type for PATCH requests.
 */
export function requireMergePatch(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/merge-patch+json')) {
    return res.status(415).json(
      errorResponse(
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/merge-patch+json for PATCH requests'
      )
    );
  }
  next();
}
