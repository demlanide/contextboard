import { limits } from '../../config/limits.js';

export class BatchValidationError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'BatchValidationError';
    this.code = code;
    this.details = details;
  }
}

export function validateBatchSize(operations: unknown[]): void {
  const count = operations.length;
  if (count < limits.batch.minOperations) {
    throw new BatchValidationError(
      'VALIDATION_ERROR',
      'Batch must contain at least 1 operation',
      { field: 'operations', reason: 'must not be empty', count }
    );
  }
  if (count > limits.batch.maxOperations) {
    throw new BatchValidationError(
      'VALIDATION_ERROR',
      `Batch exceeds maximum of ${limits.batch.maxOperations} operations`,
      { field: 'operations', reason: `exceeds maximum of ${limits.batch.maxOperations}`, count }
    );
  }
}

export function validateNoDuplicateTempIds(
  operations: Array<{ type: string; tempId?: string }>
): void {
  const seen = new Set<string>();
  for (const op of operations) {
    if (op.type === 'create' && op.tempId) {
      if (seen.has(op.tempId)) {
        throw new BatchValidationError(
          'VALIDATION_ERROR',
          `Duplicate tempId: ${op.tempId}`,
          { field: 'operations', reason: 'duplicate tempId', tempId: op.tempId }
        );
      }
      seen.add(op.tempId);
    }
  }
}
