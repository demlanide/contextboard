import { create } from 'zustand'
import type { BoardStore, HydrateBoardData, SyncError, SyncState } from './types'

const INITIAL_UI = { chatSidebarOpen: true }
const INITIAL_SYNC: SyncState = { hydrateStatus: 'idle', lastSyncedRevision: null, lastError: null }

export const useBoardStore = create<BoardStore>((set) => ({
  boardId: null,
  board: null,
  nodesById: {},
  edgesById: {},
  nodeOrder: [],
  edgeOrder: [],
  chatThread: null,
  ui: INITIAL_UI,
  sync: INITIAL_SYNC,

  hydrate: (data: HydrateBoardData) => {
    const nodesById: Record<string, HydrateBoardData['nodes'][number]> = {}
    const nodeOrder: string[] = []
    for (const node of data.nodes) {
      nodesById[node.id] = node
      nodeOrder.push(node.id)
    }

    const edgesById: Record<string, HydrateBoardData['edges'][number]> = {}
    const edgeOrder: string[] = []
    for (const edge of data.edges) {
      edgesById[edge.id] = edge
      edgeOrder.push(edge.id)
    }

    set({
      boardId: data.board.id,
      board: data.board,
      nodesById,
      edgesById,
      nodeOrder,
      edgeOrder,
      chatThread: data.chatThread,
      sync: {
        hydrateStatus: 'ready',
        lastSyncedRevision: data.board.revision,
        lastError: null,
      },
    })
  },

  reset: () =>
    set({
      boardId: null,
      board: null,
      nodesById: {},
      edgesById: {},
      nodeOrder: [],
      edgeOrder: [],
      chatThread: null,
      ui: INITIAL_UI,
      sync: INITIAL_SYNC,
    }),

  setHydrateStatus: (status: SyncState['hydrateStatus']) =>
    set((state) => ({ sync: { ...state.sync, hydrateStatus: status } })),

  setError: (error: SyncError) =>
    set({ sync: { hydrateStatus: 'error', lastSyncedRevision: null, lastError: error } }),

  toggleChatSidebar: () =>
    set((state) => ({ ui: { ...state.ui, chatSidebarOpen: !state.ui.chatSidebarOpen } })),
}))
