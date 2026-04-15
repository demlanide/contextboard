import { pool } from '../db/pool.js';
import { limits } from '../config/limits.js';
import { getOperationsAfterRevision as repoGetAfterRevision } from '../repos/operations.repo.js';
import { GetOperationsResponseData } from '../schemas/operations.schemas.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class OperationsBoardNotFoundError extends Error {
  readonly code = 'BOARD_NOT_FOUND';
  constructor() {
    super('Board not found');
    this.name = 'OperationsBoardNotFoundError';
  }
}

export class CursorInvalidError extends Error {
  readonly code = 'CURSOR_INVALID';
  readonly minSafeRevision: number;
  constructor(minSafeRevision: number) {
    super(
      'afterRevision is outside the safe polling window; perform a full board-state rehydrate before resuming incremental polling'
    );
    this.name = 'CursorInvalidError';
    this.minSafeRevision = minSafeRevision;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getOperationsAfterRevision(
  boardId: string,
  afterRevision: number,
  requestedLimit: number
): Promise<GetOperationsResponseData> {
  const { minSafeRevision, maxPageSize } = limits.polling;

  if (afterRevision < minSafeRevision) {
    throw new CursorInvalidError(minSafeRevision);
  }

  const limit = Math.min(requestedLimit, maxPageSize);

  const client = await pool.connect();
  try {
    const { operations, headRevision } = await repoGetAfterRevision(
      client,
      boardId,
      afterRevision,
      limit
    );

    if (headRevision === -1) {
      throw new OperationsBoardNotFoundError();
    }

    const nextCursor =
      operations.length > 0
        ? String(operations[operations.length - 1].boardRevision)
        : null;

    return { operations, nextCursor, headRevision };
  } finally {
    client.release();
  }
}
