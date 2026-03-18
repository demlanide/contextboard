import { createHash } from 'crypto';

export function computeApplyIdempotencyKey(
  normalizedPlan: string,
  boardRevision: number
): string {
  return createHash('sha256')
    .update(normalizedPlan + String(boardRevision))
    .digest('hex');
}
