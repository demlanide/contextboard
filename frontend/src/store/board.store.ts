import { create } from 'zustand'
import type { BoardStore, BoardNode, BoardEdge, ConnectionDragState, HydrateBoardData, SyncError, SyncState, UIState } from './types'

const INITIAL_UI: UIState = {
  chatSidebarOpen: true,
  placementMode: null,
  selectedNodeIds: [],
  editingNodeId: null,
  selectedEdgeId: null,
  connectionDrag: null,
}
const INITIAL_SYNC: SyncState = { hydrateStatus: 'idle', lastSyncedRevision: null, lastError: null }

export const useBoardStore = create<BoardStore>((set, get) => ({
  boardId: null,
  board: null,
  nodesById: {},
  edgesById: {},
  nodeOrder: [],
  edgeOrder: [],
  chatThread: null,
  pendingNodes: {},
  nodeMutationStatus: {},
  ui: INITIAL_UI,
  sync: INITIAL_SYNC,

  hydrate: (data: HydrateBoardData) => {
    const nodesById: Record<string, BoardNode> = {}
    const nodeOrder: string[] = []
    for (const node of data.nodes) {
      nodesById[node.id] = node
      nodeOrder.push(node.id)
    }

    const edgesById: Record<string, BoardEdge> = {}
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
      pendingNodes: {},
      nodeMutationStatus: {},
      ui: INITIAL_UI,
      sync: INITIAL_SYNC,
    }),

  setHydrateStatus: (status: SyncState['hydrateStatus']) =>
    set((state) => ({ sync: { ...state.sync, hydrateStatus: status } })),

  setError: (error: SyncError) =>
    set({ sync: { hydrateStatus: 'error', lastSyncedRevision: null, lastError: error } }),

  toggleChatSidebar: () =>
    set((state) => ({ ui: { ...state.ui, chatSidebarOpen: !state.ui.chatSidebarOpen } })),

  // ─── Node CRUD UI Actions ──────────────────────────────────────────────────

  setPlacementMode: (mode) =>
    set((state) => ({ ui: { ...state.ui, placementMode: mode } })),

  setSelectedNodeIds: (ids) =>
    set((state) => ({ ui: { ...state.ui, selectedNodeIds: ids } })),

  setEditingNodeId: (id) =>
    set((state) => ({ ui: { ...state.ui, editingNodeId: id } })),

  // ─── Optimistic Create ─────────────────────────────────────────────────────

  addPendingNode: (tempId, node) =>
    set((state) => ({
      pendingNodes: {
        ...state.pendingNodes,
        [tempId]: { tempId, node, status: 'pending' },
      },
      nodeMutationStatus: { ...state.nodeMutationStatus, [tempId]: 'pending' },
    })),

  confirmNode: (tempId, serverNode, boardRevision) =>
    set((state) => {
      const { [tempId]: _, ...remainingPending } = state.pendingNodes
      const { [tempId]: __, ...remainingStatus } = state.nodeMutationStatus
      return {
        pendingNodes: remainingPending,
        nodesById: { ...state.nodesById, [serverNode.id]: serverNode },
        nodeOrder: [...state.nodeOrder, serverNode.id],
        nodeMutationStatus: { ...remainingStatus, [serverNode.id]: 'confirmed' },
        board: state.board ? { ...state.board, revision: boardRevision } : null,
        sync: { ...state.sync, lastSyncedRevision: boardRevision },
      }
    }),

  rollbackPendingNode: (tempId) =>
    set((state) => {
      const { [tempId]: _, ...remainingPending } = state.pendingNodes
      return {
        pendingNodes: remainingPending,
        nodeMutationStatus: { ...state.nodeMutationStatus, [tempId]: 'failed' },
      }
    }),

  // ─── Optimistic Update ─────────────────────────────────────────────────────

  updateNodeOptimistic: (nodeId, patch) =>
    set((state) => {
      const existing = state.nodesById[nodeId]
      if (!existing) return state
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: { ...existing, ...patch },
        },
        nodeMutationStatus: { ...state.nodeMutationStatus, [nodeId]: 'pending' },
      }
    }),

  confirmNodeUpdate: (nodeId, serverNode, boardRevision) =>
    set((state) => ({
      nodesById: { ...state.nodesById, [nodeId]: serverNode },
      nodeMutationStatus: { ...state.nodeMutationStatus, [nodeId]: 'confirmed' },
      board: state.board ? { ...state.board, revision: boardRevision } : null,
      sync: { ...state.sync, lastSyncedRevision: boardRevision },
    })),

  rollbackNodeUpdate: (nodeId, snapshot) =>
    set((state) => ({
      nodesById: { ...state.nodesById, [nodeId]: snapshot },
      nodeMutationStatus: { ...state.nodeMutationStatus, [nodeId]: 'failed' },
    })),

  setNodePosition: (nodeId, x, y) =>
    set((state) => {
      const existing = state.nodesById[nodeId]
      if (!existing) return state
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: { ...existing, x, y },
        },
      }
    }),

  // ─── Optimistic Delete ─────────────────────────────────────────────────────

  deleteNodeOptimistic: (nodeId) => {
    const state = get()
    const node = state.nodesById[nodeId]
    if (!node) return null

    const connectedEdges = Object.values(state.edgesById).filter(
      (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
    )

    set({
      nodesById: Object.fromEntries(
        Object.entries(state.nodesById).filter(([id]) => id !== nodeId),
      ),
      nodeOrder: state.nodeOrder.filter((id) => id !== nodeId),
      edgesById: Object.fromEntries(
        Object.entries(state.edgesById).filter(
          ([id]) => !connectedEdges.some((e) => e.id === id),
        ),
      ),
      edgeOrder: state.edgeOrder.filter(
        (id) => !connectedEdges.some((e) => e.id === id),
      ),
      nodeMutationStatus: { ...state.nodeMutationStatus, [nodeId]: 'pending' },
    })

    return { node, edges: connectedEdges }
  },

  undoDeleteNode: (snapshot) =>
    set((state) => ({
      nodesById: { ...state.nodesById, [snapshot.node.id]: snapshot.node },
      nodeOrder: [...state.nodeOrder, snapshot.node.id],
      edgesById: {
        ...state.edgesById,
        ...Object.fromEntries(snapshot.edges.map((e) => [e.id, e])),
      },
      edgeOrder: [...state.edgeOrder, ...snapshot.edges.map((e) => e.id)],
      nodeMutationStatus: {
        ...state.nodeMutationStatus,
        [snapshot.node.id]: 'confirmed',
      },
    })),

  confirmNodeDelete: (nodeId, _deletedEdgeIds, boardRevision) =>
    set((state) => {
      const { [nodeId]: _, ...remainingStatus } = state.nodeMutationStatus
      return {
        nodeMutationStatus: remainingStatus,
        board: state.board ? { ...state.board, revision: boardRevision } : null,
        sync: { ...state.sync, lastSyncedRevision: boardRevision },
      }
    }),

  // ─── Mutation Status ───────────────────────────────────────────────────────

  clearNodeMutationStatus: (nodeId) =>
    set((state) => {
      const { [nodeId]: _, ...remaining } = state.nodeMutationStatus
      return { nodeMutationStatus: remaining }
    }),

  // ─── Edge CRUD UI Actions ────────────────────────────────────────────────

  setSelectedEdgeId: (id) =>
    set((state) => ({ ui: { ...state.ui, selectedEdgeId: id } })),

  setConnectionDrag: (dragState) =>
    set((state) => ({ ui: { ...state.ui, connectionDrag: dragState } })),

  // ─── Optimistic Edge Create ──────────────────────────────────────────────

  addEdgeOptimistic: (tempId, edge) =>
    set((state) => ({
      edgesById: { ...state.edgesById, [tempId]: edge },
      edgeOrder: [...state.edgeOrder, tempId],
    })),

  confirmEdge: (tempId, serverEdge, boardRevision) =>
    set((state) => {
      const { [tempId]: _, ...remainingEdges } = state.edgesById
      return {
        edgesById: { ...remainingEdges, [serverEdge.id]: serverEdge },
        edgeOrder: state.edgeOrder
          .filter((id) => id !== tempId)
          .concat(serverEdge.id),
        board: state.board ? { ...state.board, revision: boardRevision } : null,
        sync: { ...state.sync, lastSyncedRevision: boardRevision },
      }
    }),

  rollbackEdge: (tempId) =>
    set((state) => {
      const { [tempId]: _, ...remainingEdges } = state.edgesById
      return {
        edgesById: remainingEdges,
        edgeOrder: state.edgeOrder.filter((id) => id !== tempId),
      }
    }),

  // ─── Optimistic Edge Update ──────────────────────────────────────────────

  updateEdgeOptimistic: (edgeId, patch) =>
    set((state) => {
      const existing = state.edgesById[edgeId]
      if (!existing) return state
      return {
        edgesById: {
          ...state.edgesById,
          [edgeId]: { ...existing, ...patch },
        },
      }
    }),

  confirmEdgeUpdate: (edgeId, serverEdge, boardRevision) =>
    set((state) => ({
      edgesById: { ...state.edgesById, [edgeId]: serverEdge },
      board: state.board ? { ...state.board, revision: boardRevision } : null,
      sync: { ...state.sync, lastSyncedRevision: boardRevision },
    })),

  rollbackEdgeUpdate: (edgeId, snapshot) =>
    set((state) => ({
      edgesById: { ...state.edgesById, [edgeId]: snapshot },
    })),

  // ─── Optimistic Edge Delete ──────────────────────────────────────────────

  removeEdgeOptimistic: (edgeId) => {
    const state = get()
    const edge = state.edgesById[edgeId]
    if (!edge) return null

    set({
      edgesById: Object.fromEntries(
        Object.entries(state.edgesById).filter(([id]) => id !== edgeId),
      ),
      edgeOrder: state.edgeOrder.filter((id) => id !== edgeId),
    })

    return { edge }
  },

  confirmEdgeDelete: (edgeId, boardRevision) =>
    set((state) => ({
      board: state.board ? { ...state.board, revision: boardRevision } : null,
      sync: { ...state.sync, lastSyncedRevision: boardRevision },
    })),

  undoEdgeDelete: (snapshot) =>
    set((state) => ({
      edgesById: { ...state.edgesById, [snapshot.edge.id]: snapshot.edge },
      edgeOrder: [...state.edgeOrder, snapshot.edge.id],
    })),
}))
