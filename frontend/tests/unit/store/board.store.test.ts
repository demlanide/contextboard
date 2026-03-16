import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from '@/store/board.store'
import type { HydrateBoardData } from '@/store/types'

const mockHydrateData: HydrateBoardData = {
  board: {
    id: 'board-1',
    title: 'Test Board',
    description: null,
    status: 'active',
    viewportState: { x: 0, y: 0, zoom: 1 },
    settings: { gridEnabled: true, snapToGrid: false, agentEditMode: 'suggest' },
    summary: {},
    revision: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  nodes: [
    {
      id: 'node-1',
      boardId: 'board-1',
      type: 'sticky',
      parentId: null,
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      content: {},
      style: {},
      metadata: {},
      locked: false,
      hidden: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'node-2',
      boardId: 'board-1',
      type: 'text',
      parentId: null,
      x: 50,
      y: 60,
      width: 200,
      height: 50,
      rotation: 0,
      zIndex: 2,
      content: {},
      style: {},
      metadata: {},
      locked: false,
      hidden: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  edges: [
    {
      id: 'edge-1',
      boardId: 'board-1',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      label: null,
      style: {},
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  chatThread: { id: 'thread-1', boardId: 'board-1' },
}

describe('board store', () => {
  beforeEach(() => {
    useBoardStore.getState().reset()
  })

  it('has correct initial state', () => {
    const state = useBoardStore.getState()
    expect(state.boardId).toBeNull()
    expect(state.board).toBeNull()
    expect(state.nodesById).toEqual({})
    expect(state.edgesById).toEqual({})
    expect(state.nodeOrder).toEqual([])
    expect(state.edgeOrder).toEqual([])
    expect(state.chatThread).toBeNull()
    expect(state.ui.chatSidebarOpen).toBe(true)
    expect(state.sync.hydrateStatus).toBe('idle')
    expect(state.sync.lastSyncedRevision).toBeNull()
    expect(state.sync.lastError).toBeNull()
  })

  it('hydrates board data with normalized nodes and edges', () => {
    useBoardStore.getState().hydrate(mockHydrateData)
    const state = useBoardStore.getState()

    expect(state.boardId).toBe('board-1')
    expect(state.board?.title).toBe('Test Board')
    expect(state.nodesById['node-1']).toBeDefined()
    expect(state.nodesById['node-2']).toBeDefined()
    expect(state.nodeOrder).toEqual(['node-1', 'node-2'])
    expect(state.edgesById['edge-1']).toBeDefined()
    expect(state.edgeOrder).toEqual(['edge-1'])
    expect(state.chatThread?.id).toBe('thread-1')
    expect(state.sync.hydrateStatus).toBe('ready')
    expect(state.sync.lastSyncedRevision).toBe(5)
    expect(state.sync.lastError).toBeNull()
  })

  it('resets to initial state', () => {
    useBoardStore.getState().hydrate(mockHydrateData)
    useBoardStore.getState().reset()
    const state = useBoardStore.getState()

    expect(state.boardId).toBeNull()
    expect(state.board).toBeNull()
    expect(state.nodesById).toEqual({})
    expect(state.sync.hydrateStatus).toBe('idle')
    expect(state.ui.chatSidebarOpen).toBe(true)
  })

  it('sets error state', () => {
    const error = { code: 'BOARD_NOT_FOUND', message: 'Not found', retryable: false }
    useBoardStore.getState().setError(error)
    const state = useBoardStore.getState()

    expect(state.sync.hydrateStatus).toBe('error')
    expect(state.sync.lastError).toEqual(error)
  })

  it('toggles chat sidebar', () => {
    expect(useBoardStore.getState().ui.chatSidebarOpen).toBe(true)
    useBoardStore.getState().toggleChatSidebar()
    expect(useBoardStore.getState().ui.chatSidebarOpen).toBe(false)
    useBoardStore.getState().toggleChatSidebar()
    expect(useBoardStore.getState().ui.chatSidebarOpen).toBe(true)
  })

  it('sets hydrate status', () => {
    useBoardStore.getState().setHydrateStatus('loading')
    expect(useBoardStore.getState().sync.hydrateStatus).toBe('loading')
  })
})
