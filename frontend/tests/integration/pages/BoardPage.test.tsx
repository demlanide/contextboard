import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { BoardPage } from '@/pages/BoardPage'
import { useBoardStore } from '@/store/board.store'

vi.mock('@/api/boards.api', () => ({
  hydrateBoardState: vi.fn(),
}))

import { hydrateBoardState } from '@/api/boards.api'

const mockBoardState = {
  board: {
    id: 'board-1',
    title: 'Test Board',
    description: null,
    status: 'active',
    viewportState: { x: 0, y: 0, zoom: 1 },
    settings: { gridEnabled: true, snapToGrid: false, agentEditMode: 'suggest' },
    summary: {},
    revision: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  nodes: [],
  edges: [],
  chatThread: { id: 'thread-1', boardId: 'board-1' },
  lastOperationRevision: 3,
}

function renderBoardPage(boardId = 'board-1') {
  return render(
    <MemoryRouter initialEntries={[`/boards/${boardId}`]}>
      <Routes>
        <Route path="/boards/:boardId" element={<BoardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBoardStore.getState().reset()
  })

  it('shows loading spinner while hydrating', () => {
    vi.mocked(hydrateBoardState).mockReturnValue(new Promise(() => {}))
    renderBoardPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders workspace after successful hydration', async () => {
    vi.mocked(hydrateBoardState).mockResolvedValue({
      data: mockBoardState,
      error: null,
    })

    renderBoardPage()

    await waitFor(() => {
      expect(screen.getByText('Test Board')).toBeInTheDocument()
    })
    expect(screen.getByText('Chat')).toBeInTheDocument()
  })

  it('shows error state on hydration failure', async () => {
    vi.mocked(hydrateBoardState).mockResolvedValue({
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Unable to reach the server.', retryable: true },
    })

    renderBoardPage()

    await waitFor(() => {
      expect(screen.getByText('Unable to reach the server.')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })
  })

  it('shows not-found error with back button', async () => {
    vi.mocked(hydrateBoardState).mockResolvedValue({
      data: null,
      error: {
        code: 'BOARD_NOT_FOUND',
        message: "This board doesn't exist or has been deleted.",
        retryable: false,
      },
    })

    renderBoardPage('nonexistent')

    await waitFor(() => {
      expect(screen.getByText("This board doesn't exist or has been deleted.")).toBeInTheDocument()
      expect(screen.getByText('Go Back')).toBeInTheDocument()
    })
  })
})
