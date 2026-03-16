import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  res.setHeader('X-Request-Id', id);
  (req as Request & { requestId: string }).requestId = id;
  next();
}
