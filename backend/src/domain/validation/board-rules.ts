export type BoardStatus = 'active' | 'archived' | 'deleted';

export class BoardError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'BoardError';
  }
}

export class BoardNotFoundError extends BoardError {
  constructor() {
    super('BOARD_NOT_FOUND', 'Board not found');
  }
}

export class BoardValidationError extends BoardError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

/**
 * Validate that a board exists and is not deleted.
 * Returns 404 if missing or deleted.
 */
export function assertBoardExists(board: { status: BoardStatus } | null): void {
  if (!board || board.status === 'deleted') {
    throw new BoardNotFoundError();
  }
}

/**
 * Validate that a board can be mutated (not archived or deleted).
 * Used for metadata updates.
 */
export function assertBoardEditable(board: { status: BoardStatus }): void {
  if (board.status === 'deleted') {
    throw new BoardNotFoundError();
  }
  if (board.status === 'archived') {
    throw new BoardValidationError('Archived boards are read-only');
  }
}

/**
 * Validate a requested status transition via PATCH.
 * Returns the transition type or throws 422.
 */
export function validateStatusTransition(
  currentStatus: BoardStatus,
  requestedStatus: string
): 'archive' {
  if (currentStatus === 'deleted') {
    throw new BoardNotFoundError();
  }

  if (requestedStatus === 'archived') {
    if (currentStatus === 'active') {
      return 'archive';
    }
    if (currentStatus === 'archived') {
      throw new BoardValidationError('Board is already archived');
    }
  }

  if (requestedStatus === 'active') {
    throw new BoardValidationError('Un-archiving boards is not supported in this version');
  }

  if (requestedStatus === 'deleted') {
    throw new BoardValidationError('Use the DELETE endpoint to delete a board');
  }

  throw new BoardValidationError(`Invalid status transition: ${currentStatus} → ${requestedStatus}`);
}
