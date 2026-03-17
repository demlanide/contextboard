import { limits } from '../../config/limits.js';
import { BoardError, BoardNotFoundError } from './board-rules.js';

export class ChatError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

export class ChatThreadNotFoundError extends ChatError {
  constructor() {
    super('CHAT_THREAD_NOT_FOUND', 'Chat thread not found');
  }
}

export class ChatValidationError extends ChatError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

export function validateMessageText(text: string): void {
  if (text.length < limits.chat.messageText.min) {
    throw new ChatValidationError('Message text must not be empty');
  }
  if (text.length > limits.chat.messageText.max) {
    throw new ChatValidationError(
      `Message text must not exceed ${limits.chat.messageText.max} characters`
    );
  }
}

export function validateSelectionContext(
  context: Record<string, unknown> | undefined
): void {
  if (!context) return;

  const { selectedNodeIds, selectedEdgeIds, viewport } = context;

  if (selectedNodeIds !== undefined) {
    if (!Array.isArray(selectedNodeIds)) {
      throw new ChatValidationError('selectedNodeIds must be an array');
    }
    if (selectedNodeIds.length > limits.chat.selectionMaxNodeIds) {
      throw new ChatValidationError(
        `selectedNodeIds must not exceed ${limits.chat.selectionMaxNodeIds} items`
      );
    }
  }

  if (selectedEdgeIds !== undefined) {
    if (!Array.isArray(selectedEdgeIds)) {
      throw new ChatValidationError('selectedEdgeIds must be an array');
    }
    if (selectedEdgeIds.length > limits.chat.selectionMaxEdgeIds) {
      throw new ChatValidationError(
        `selectedEdgeIds must not exceed ${limits.chat.selectionMaxEdgeIds} items`
      );
    }
  }

  if (viewport !== undefined) {
    if (typeof viewport !== 'object' || viewport === null) {
      throw new ChatValidationError('viewport must be an object');
    }
    const vp = viewport as Record<string, unknown>;
    if (typeof vp.x !== 'number' || typeof vp.y !== 'number' || typeof vp.zoom !== 'number') {
      throw new ChatValidationError('viewport must have numeric x, y, zoom');
    }
    if (vp.zoom <= 0) {
      throw new ChatValidationError('viewport zoom must be positive');
    }
  }
}

export function assertBoardChatWritable(board: { status: string } | null): void {
  if (!board || board.status === 'deleted') {
    throw new BoardNotFoundError();
  }
  if (board.status === 'archived') {
    throw new BoardError('BOARD_ARCHIVED', 'Board is archived. Chat is read-only.');
  }
}

export function assertThreadExists(
  thread: { id: string } | null
): asserts thread is { id: string } {
  if (!thread) {
    throw new ChatThreadNotFoundError();
  }
}
