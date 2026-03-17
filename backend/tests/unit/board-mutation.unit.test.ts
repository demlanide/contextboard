/**
 * Unit tests for withBoardMutation.
 * All external dependencies (pool, repos, logger) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoardNotFoundError } from '../../src/domain/validation/board-rules.js';

// ─── Mocks (hoisted so vi.mock factories can reference them) ─────────────────

const { mockQuery, mockRelease, mockClient, mockFindBoardById, mockUpdateBoard, mockInsertOperation } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockRelease = vi.fn();
  const mockClient = { query: mockQuery, release: mockRelease };
  const mockFindBoardById = vi.fn();
  const mockUpdateBoard = vi.fn();
  const mockInsertOperation = vi.fn();
  return { mockQuery, mockRelease, mockClient, mockFindBoardById, mockUpdateBoard, mockInsertOperation };
});

vi.mock('../../src/db/pool.js', () => ({
  pool: {
    connect: vi.fn().mockResolvedValue(mockClient),
  },
}));

vi.mock('../../src/repos/boards.repo.js', () => ({
  findBoardById: (...args: unknown[]) => mockFindBoardById(...args),
  updateBoard: (...args: unknown[]) => mockUpdateBoard(...args),
}));

vi.mock('../../src/repos/operations.repo.js', () => ({
  insertOperation: (...args: unknown[]) => mockInsertOperation(...args),
}));

vi.mock('../../src/obs/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

// Import after mocks are set up
import { withBoardMutation } from '../../src/db/tx.js';
import { Board } from '../../src/schemas/board.schemas.js';
import { buildOperation } from '../../src/domain/operations/operation-factory.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    title: 'Test',
    description: null,
    status: 'active',
    viewportState: {},
    settings: {},
    summary: {},
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: BEGIN, advisory lock, COMMIT
  mockQuery.mockResolvedValue({ rows: [] });
  mockUpdateBoard.mockResolvedValue(makeBoard({ revision: 1 }));
  mockInsertOperation.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('withBoardMutation', () => {
  it('acquires advisory lock before calling callback', async () => {
    const board = makeBoard();
    mockFindBoardById.mockResolvedValue(board);

    const callOrder: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) callOrder.push('lock');
      return { rows: [] };
    });

    await withBoardMutation('board-1', async ({ board: b }) => {
      callOrder.push('callback');
      return { result: b, operations: [], newRevision: null };
    });

    expect(callOrder.indexOf('lock')).toBeLessThan(callOrder.indexOf('callback'));
  });

  it('loads board and passes it to callback', async () => {
    const board = makeBoard({ title: 'Loaded Board' });
    mockFindBoardById.mockResolvedValue(board);

    let receivedBoard: Board | null = null;
    await withBoardMutation('board-1', async ({ board: b }) => {
      receivedBoard = b;
      return { result: b, operations: [], newRevision: null };
    });

    expect(receivedBoard).toEqual(board);
    expect(mockFindBoardById).toHaveBeenCalledWith(mockClient, 'board-1');
  });

  it('bumps revision when newRevision is not null', async () => {
    const board = makeBoard({ revision: 5 });
    mockFindBoardById.mockResolvedValue(board);

    await withBoardMutation('board-1', async ({ board: b }) => {
      return { result: b, operations: [], newRevision: 6 };
    });

    expect(mockUpdateBoard).toHaveBeenCalledWith(mockClient, 'board-1', { revision: 6 });
  });

  it('skips revision bump when newRevision is null', async () => {
    const board = makeBoard();
    mockFindBoardById.mockResolvedValue(board);

    await withBoardMutation('board-1', async ({ board: b }) => {
      return { result: b, operations: [], newRevision: null };
    });

    expect(mockUpdateBoard).not.toHaveBeenCalled();
  });

  it('inserts all returned operations', async () => {
    const board = makeBoard();
    mockFindBoardById.mockResolvedValue(board);

    const op1 = buildOperation({
      boardId: 'board-1', boardRevision: 1, actorType: 'user',
      operationType: 'update_board', targetType: 'board', payload: {},
    });
    const op2 = buildOperation({
      boardId: 'board-1', boardRevision: 1, actorType: 'user',
      operationType: 'update_board', targetType: 'board', payload: {},
    });

    await withBoardMutation('board-1', async ({ board: b }) => {
      return { result: b, operations: [op1, op2], newRevision: 1 };
    });

    expect(mockInsertOperation).toHaveBeenCalledTimes(2);
    expect(mockInsertOperation).toHaveBeenCalledWith(mockClient, op1);
    expect(mockInsertOperation).toHaveBeenCalledWith(mockClient, op2);
  });

  it('rolls back on callback error — no operations or revision change', async () => {
    const board = makeBoard();
    mockFindBoardById.mockResolvedValue(board);

    const callSequence: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') callSequence.push('BEGIN');
      if (sql === 'COMMIT') callSequence.push('COMMIT');
      if (sql === 'ROLLBACK') callSequence.push('ROLLBACK');
      return { rows: [] };
    });

    await expect(
      withBoardMutation('board-1', async () => {
        throw new Error('callback failed');
      })
    ).rejects.toThrow('callback failed');

    expect(callSequence).toContain('ROLLBACK');
    expect(callSequence).not.toContain('COMMIT');
    expect(mockUpdateBoard).not.toHaveBeenCalled();
    expect(mockInsertOperation).not.toHaveBeenCalled();
  });

  it('throws BOARD_NOT_FOUND for missing board', async () => {
    mockFindBoardById.mockResolvedValue(null);

    await expect(
      withBoardMutation('board-1', async ({ board: b }) => ({
        result: b, operations: [], newRevision: null,
      }))
    ).rejects.toThrow(BoardNotFoundError);
  });

  it('throws BOARD_NOT_FOUND for deleted board', async () => {
    const board = makeBoard({ status: 'deleted' });
    mockFindBoardById.mockResolvedValue(board);

    await expect(
      withBoardMutation('board-1', async ({ board: b }) => ({
        result: b, operations: [], newRevision: null,
      }))
    ).rejects.toThrow(BoardNotFoundError);
  });

  it('returns the result from the callback', async () => {
    const board = makeBoard();
    mockFindBoardById.mockResolvedValue(board);

    const returnValue = await withBoardMutation('board-1', async ({ board: b }) => ({
      result: { custom: 'data' },
      operations: [],
      newRevision: null,
    }));

    expect(returnValue).toEqual({ custom: 'data' });
  });
});
