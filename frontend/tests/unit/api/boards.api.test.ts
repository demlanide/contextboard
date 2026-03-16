import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createBoard, hydrateBoardState, listBoards } from '@/api/boards.api'

const mockBoard = {
  id: 'board-1',
  title: 'Test Board',
  description: '',
  status: 'active',
  viewportState: { x: 0, y: 0, zoom: 1 },
  settings: { gridEnabled: true, snapToGrid: false, agentEditMode: 'suggest' },
  summary: {},
  revision: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('boards API', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createBoard sends POST and returns board data on success', async () => {
    const response = {
      data: { board: mockBoard, chatThread: { id: 'thread-1', boardId: 'board-1' } },
      error: null,
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    } as Response)

    const result = await createBoard('Test Board')

    expect(fetch).toHaveBeenCalledWith(
      '/api/boards',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Test Board', description: '' }),
      }),
    )
    expect(result.data?.board.id).toBe('board-1')
    expect(result.error).toBeNull()
  })

  it('createBoard returns error on validation failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Title required' },
        }),
    } as Response)

    const result = await createBoard('')
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(result.error?.retryable).toBe(false)
    expect(result.data).toBeNull()
  })

  it('hydrateBoardState returns board state on success', async () => {
    const response = {
      data: {
        board: mockBoard,
        nodes: [],
        edges: [],
        chatThread: { id: 'thread-1', boardId: 'board-1' },
        lastOperationRevision: 0,
      },
      error: null,
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    } as Response)

    const result = await hydrateBoardState('board-1')
    expect(result.data?.board.id).toBe('board-1')
    expect(result.error).toBeNull()
  })

  it('hydrateBoardState returns not-found error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          data: null,
          error: { code: 'BOARD_NOT_FOUND', message: 'Board not found' },
        }),
    } as Response)

    const result = await hydrateBoardState('nonexistent')
    expect(result.error?.code).toBe('BOARD_NOT_FOUND')
    expect(result.error?.retryable).toBe(false)
  })

  it('returns network error on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await listBoards()
    expect(result.error?.code).toBe('NETWORK_ERROR')
    expect(result.error?.retryable).toBe(true)
  })

  it('returns timeout error on abort', async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    const result = await listBoards()
    expect(result.error?.code).toBe('TIMEOUT')
    expect(result.error?.retryable).toBe(true)
  })

  it('listBoards returns board list on success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { boards: [mockBoard] }, error: null }),
    } as Response)

    const result = await listBoards()
    expect(result.data?.boards).toHaveLength(1)
    expect(result.data?.boards[0].id).toBe('board-1')
  })
})
