/**
 * Unit tests for the board-state service.
 * All repositories are mocked — no DB required.
 *
 * Run: pnpm run test:unit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBoardState } from '../../src/services/board-state.service.js';
import { BoardNotFoundError } from '../../src/domain/validation/board-rules.js';

// Mock the db/tx module so withTransaction just calls the callback with a fake client
vi.mock('../../src/db/tx.js', () => ({
  withTransaction: async (fn: (client: unknown) => unknown) => fn({}),
}));

// Mock repos
vi.mock('../../src/repos/boards.repo.js', () => ({
  findByIdExcludingDeleted: vi.fn(),
}));
vi.mock('../../src/repos/nodes.repo.js', () => ({
  findActiveByBoardId: vi.fn(),
}));
vi.mock('../../src/repos/edges.repo.js', () => ({
  findActiveByBoardId: vi.fn(),
}));
vi.mock('../../src/repos/chat-threads.repo.js', () => ({
  findByBoardId: vi.fn(),
}));

import { findByIdExcludingDeleted } from '../../src/repos/boards.repo.js';
import { findActiveByBoardId as findActiveNodes } from '../../src/repos/nodes.repo.js';
import { findActiveByBoardId as findActiveEdges } from '../../src/repos/edges.repo.js';
import { findByBoardId as findChatThread } from '../../src/repos/chat-threads.repo.js';

const mockBoard = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  title: 'Test Board',
  description: null,
  status: 'active' as const,
  viewportState: { x: 0, y: 0, zoom: 1 },
  settings: {},
  summary: {},
  revision: 5,
  createdAt: '2026-03-16T10:00:00.000Z',
  updatedAt: '2026-03-16T10:00:00.000Z',
};

const mockChatThread = {
  id: 'cccccccc-0000-0000-0000-000000000001',
  boardId: mockBoard.id,
  metadata: {},
  createdAt: '2026-03-16T10:00:00.000Z',
  updatedAt: '2026-03-16T10:00:00.000Z',
};

const mockNode = {
  id: 'nnnnnnnn-0000-0000-0000-000000000001',
  boardId: mockBoard.id,
  type: 'sticky' as const,
  parentId: null,
  x: 100, y: 100, width: 200, height: 120, rotation: 0, zIndex: 0,
  content: {}, style: {}, metadata: {},
  locked: false, hidden: false,
  createdAt: '2026-03-16T10:00:00.000Z',
  updatedAt: '2026-03-16T10:00:00.000Z',
};

const mockEdge = {
  id: 'eeeeeeee-0000-0000-0000-000000000001',
  boardId: mockBoard.id,
  sourceNodeId: 'nnnnnnnn-0000-0000-0000-000000000001',
  targetNodeId: 'nnnnnnnn-0000-0000-0000-000000000002',
  label: null,
  style: {}, metadata: {},
  createdAt: '2026-03-16T10:00:00.000Z',
  updatedAt: '2026-03-16T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getBoardState', () => {
  it('throws BoardNotFoundError when board is not found', async () => {
    vi.mocked(findByIdExcludingDeleted).mockResolvedValue(null);

    await expect(getBoardState(mockBoard.id)).rejects.toThrow(BoardNotFoundError);
  });

  it('throws Error when chat thread is missing (data integrity failure)', async () => {
    vi.mocked(findByIdExcludingDeleted).mockResolvedValue(mockBoard);
    vi.mocked(findActiveNodes).mockResolvedValue([mockNode]);
    vi.mocked(findActiveEdges).mockResolvedValue([]);
    vi.mocked(findChatThread).mockResolvedValue(null);

    await expect(getBoardState(mockBoard.id)).rejects.toThrow('Board state could not be loaded');
  });

  it('returns assembled state with correct lastOperationRevision', async () => {
    vi.mocked(findByIdExcludingDeleted).mockResolvedValue(mockBoard);
    vi.mocked(findActiveNodes).mockResolvedValue([mockNode]);
    vi.mocked(findActiveEdges).mockResolvedValue([mockEdge]);
    vi.mocked(findChatThread).mockResolvedValue(mockChatThread);

    const state = await getBoardState(mockBoard.id);

    expect(state.board).toEqual(mockBoard);
    expect(state.nodes).toEqual([mockNode]);
    expect(state.edges).toEqual([mockEdge]);
    expect(state.chatThread).toEqual(mockChatThread);
    expect(state.lastOperationRevision).toBe(mockBoard.revision);
  });

  it('returns empty nodes and edges arrays for an empty board', async () => {
    vi.mocked(findByIdExcludingDeleted).mockResolvedValue({ ...mockBoard, revision: 0 });
    vi.mocked(findActiveNodes).mockResolvedValue([]);
    vi.mocked(findActiveEdges).mockResolvedValue([]);
    vi.mocked(findChatThread).mockResolvedValue(mockChatThread);

    const state = await getBoardState(mockBoard.id);

    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.lastOperationRevision).toBe(0);
  });
});
