import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router'
import { HomePage } from '@/pages/HomePage'

vi.mock('@/api/boards.api', () => ({
  listBoards: vi.fn(),
  toBoardListItem: vi.fn((board: { id: string; title: string; status: string; updatedAt: string; createdAt: string }) => ({
    id: board.id,
    title: board.title,
    status: board.status === 'archived' ? 'archived' : 'active',
    updatedAt: board.updatedAt,
    createdAt: board.createdAt,
  })),
  createBoard: vi.fn(),
}))

import { listBoards } from '@/api/boards.api'

function renderHomePage() {
  return render(
    <BrowserRouter>
      <HomePage />
    </BrowserRouter>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner initially', () => {
    vi.mocked(listBoards).mockReturnValue(new Promise(() => {}))
    renderHomePage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders board list when boards exist', async () => {
    vi.mocked(listBoards).mockResolvedValue({
      data: {
        boards: [
          {
            id: 'b1',
            title: 'My Board',
            description: null,
            status: 'active' as const,
            viewportState: { x: 0, y: 0, zoom: 1 },
            settings: { gridEnabled: true, snapToGrid: false, agentEditMode: 'suggest' as const },
            summary: {},
            revision: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
      error: null,
    })

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByText('My Board')).toBeInTheDocument()
    })
  })

  it('renders empty state when no boards', async () => {
    vi.mocked(listBoards).mockResolvedValue({
      data: { boards: [] },
      error: null,
    })

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByText('No boards yet')).toBeInTheDocument()
    })
  })

  it('opens create dialog when clicking Create Board', async () => {
    vi.mocked(listBoards).mockResolvedValue({ data: { boards: [] }, error: null })
    const user = userEvent.setup()

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByText('No boards yet')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Create Board' }))
    expect(screen.getByText('Create New Board')).toBeInTheDocument()
  })

  it('shows error with retry on fetch failure', async () => {
    vi.mocked(listBoards).mockResolvedValue({
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Unable to reach the server.', retryable: true },
    })

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByText('Unable to reach the server.')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })
  })
})
