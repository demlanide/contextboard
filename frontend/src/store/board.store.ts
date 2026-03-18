import { create } from 'zustand'
import type { BoardStore, BoardNode, BoardEdge, BoardAsset, BatchMutationState, ConnectionDragState, HydrateBoardData, SyncError, SyncState, UIState, ChatState, AgentState, ChatMessage, AgentSuggestion, ApplyResponse } from './types'

const INITIAL_BATCH: BatchMutationState = {
  status: 'idle',
  affectedNodeIds: [],
  snapshots: {},
  edgeSnapshots: {},
  error: null,
}

const INITIAL_CHAT: ChatState = {
  messages: [],
  sendStatus: 'idle',
  loadStatus: 'idle',
  draftText: '',
  lastError: null,
}

const INITIAL_AGENT: AgentState = {
  suggestStatus: 'idle',
  latestSuggestion: null,
  previewVisible: false,
  previewStale: false,
  suggestError: null,
  applyStatus: 'idle',
  applyError: null,
}

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
  assetsById: {},
  chatThread: null,
  pendingNodes: {},
  nodeMutationStatus: {},
  batchMutation: INITIAL_BATCH,
  chatState: INITIAL_CHAT,
  agentState: INITIAL_AGENT,
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

    const assetsById: Record<string, BoardAsset> = {}
    if (data.assets) {
      for (const asset of data.assets) {
        assetsById[asset.id] = asset
      }
    }

    set({
      boardId: data.board.id,
      board: data.board,
      nodesById,
      edgesById,
      nodeOrder,
      edgeOrder,
      assetsById,
      chatThread: data.chatThread,
      sync: {
        hydrateStatus: 'ready',
        lastSyncedRevision: data.board.revision,
        lastError: null,
      },
    })
  },

  addAsset: (asset: BoardAsset) =>
    set((state) => ({
      assetsById: { ...state.assetsById, [asset.id]: asset },
    })),

  reset: () =>
    set({
      boardId: null,
      board: null,
      nodesById: {},
      edgesById: {},
      nodeOrder: [],
      edgeOrder: [],
      assetsById: {},
      chatThread: null,
      pendingNodes: {},
      nodeMutationStatus: {},
      batchMutation: INITIAL_BATCH,
      chatState: INITIAL_CHAT,
      agentState: INITIAL_AGENT,
      ui: INITIAL_UI,
      sync: INITIAL_SYNC,
    }),

  setHydrateStatus: (status: SyncState['hydrateStatus']) =>
    set((state) => ({ sync: { ...state.sync, hydrateStatus: status } })),

  setError: (error: SyncError) =>
    set({ sync: { hydrateStatus: 'error', lastSyncedRevision: null, lastError: error } }),

  toggleChatSidebar: () =>
    set((state) => ({ ui: { ...state.ui, chatSidebarOpen: !state.ui.chatSidebarOpen } })),

  // ─── Chat Actions ──────────────────────────────────────────────────────────

  loadChatHistory: (messages: ChatMessage[]) =>
    set({ chatState: { ...INITIAL_CHAT, messages, loadStatus: 'ready' } }),

  setChatLoadStatus: (status: ChatState['loadStatus']) =>
    set((state) => ({ chatState: { ...state.chatState, loadStatus: status } })),

  setChatSendStatus: (status: ChatState['sendStatus']) =>
    set((state) => ({ chatState: { ...state.chatState, sendStatus: status } })),

  appendChatMessages: (...messages: ChatMessage[]) =>
    set((state) => ({
      chatState: { ...state.chatState, messages: [...state.chatState.messages, ...messages] },
    })),

  setChatLastError: (error: string | null) =>
    set((state) => ({ chatState: { ...state.chatState, lastError: error } })),

  setChatDraftText: (text: string) =>
    set((state) => ({ chatState: { ...state.chatState, draftText: text } })),

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

  // ─── Batch Mutations ─────────────────────────────────────────────────────

  batchMoveOptimistic: (moves) =>
    set((state) => {
      const snapshots: Record<string, BoardNode> = {}
      const newNodesById = { ...state.nodesById }
      const affectedNodeIds: string[] = []

      for (const move of moves) {
        const node = state.nodesById[move.nodeId]
        if (!node) continue
        snapshots[move.nodeId] = node
        affectedNodeIds.push(move.nodeId)
        newNodesById[move.nodeId] = { ...node, x: move.x, y: move.y }
      }

      return {
        nodesById: newNodesById,
        batchMutation: {
          status: 'pending',
          affectedNodeIds,
          snapshots,
          edgeSnapshots: {},
          error: null,
        },
      }
    }),

  batchCreateOptimistic: (items) =>
    set((state) => {
      const newPending = { ...state.pendingNodes }
      const affectedNodeIds: string[] = []

      for (const item of items) {
        newPending[item.tempId] = { tempId: item.tempId, node: item.node, status: 'pending' }
        affectedNodeIds.push(item.tempId)
      }

      return {
        pendingNodes: newPending,
        batchMutation: {
          status: 'pending',
          affectedNodeIds,
          snapshots: {},
          edgeSnapshots: {},
          error: null,
        },
      }
    }),

  batchDeleteOptimistic: (nodeIds) => {
    const state = get()
    const nodeSnapshots: Record<string, BoardNode> = {}
    const edgeSnapshots: Record<string, BoardEdge> = {}
    const edgeIdsToRemove = new Set<string>()

    for (const nodeId of nodeIds) {
      const node = state.nodesById[nodeId]
      if (node) nodeSnapshots[nodeId] = node
    }

    for (const [edgeId, edge] of Object.entries(state.edgesById)) {
      if (nodeIds.includes(edge.sourceNodeId) || nodeIds.includes(edge.targetNodeId)) {
        edgeSnapshots[edgeId] = edge
        edgeIdsToRemove.add(edgeId)
      }
    }

    set({
      nodesById: Object.fromEntries(
        Object.entries(state.nodesById).filter(([id]) => !nodeIds.includes(id)),
      ),
      nodeOrder: state.nodeOrder.filter((id) => !nodeIds.includes(id)),
      edgesById: Object.fromEntries(
        Object.entries(state.edgesById).filter(([id]) => !edgeIdsToRemove.has(id)),
      ),
      edgeOrder: state.edgeOrder.filter((id) => !edgeIdsToRemove.has(id)),
      batchMutation: {
        status: 'pending',
        affectedNodeIds: nodeIds,
        snapshots: nodeSnapshots,
        edgeSnapshots,
        error: null,
      },
    })

    return { nodeSnapshots, edgeSnapshots }
  },

  reconcileBatch: (response) =>
    set((state) => {
      const newNodesById = { ...state.nodesById }
      const newEdgesById = { ...state.edgesById }
      let newNodeOrder = [...state.nodeOrder]
      let newEdgeOrder = [...state.edgeOrder]
      const newPending = { ...state.pendingNodes }

      // Handle created nodes (tempId → realId)
      for (const created of response.created) {
        const { tempId, ...node } = created
        delete newPending[tempId]
        newNodesById[node.id] = node
        newNodeOrder = newNodeOrder.filter((id) => id !== tempId)
        newNodeOrder.push(node.id)
      }

      // Handle updated nodes
      for (const updated of response.updated) {
        newNodesById[updated.id] = updated
      }

      // Handle deleted entries
      for (const entry of response.deleted) {
        if (entry.type === 'node') {
          delete newNodesById[entry.id]
          newNodeOrder = newNodeOrder.filter((id) => id !== entry.id)
        } else if (entry.type === 'edge') {
          delete newEdgesById[entry.id]
          newEdgeOrder = newEdgeOrder.filter((id) => id !== entry.id)
        }
      }

      return {
        nodesById: newNodesById,
        edgesById: newEdgesById,
        nodeOrder: newNodeOrder,
        edgeOrder: newEdgeOrder,
        pendingNodes: newPending,
        board: state.board ? { ...state.board, revision: response.boardRevision } : null,
        sync: { ...state.sync, lastSyncedRevision: response.boardRevision },
        batchMutation: INITIAL_BATCH,
      }
    }),

  rollbackBatch: () =>
    set((state) => {
      const newNodesById = { ...state.nodesById }
      for (const [nodeId, snapshot] of Object.entries(state.batchMutation.snapshots)) {
        newNodesById[nodeId] = snapshot
      }
      return {
        nodesById: newNodesById,
        batchMutation: { ...state.batchMutation, status: 'error' },
      }
    }),

  rollbackBatchDelete: (nodeSnapshots, edgeSnapshots) =>
    set((state) => ({
      nodesById: { ...state.nodesById, ...nodeSnapshots },
      nodeOrder: [...state.nodeOrder, ...Object.keys(nodeSnapshots)],
      edgesById: { ...state.edgesById, ...edgeSnapshots },
      edgeOrder: [...state.edgeOrder, ...Object.keys(edgeSnapshots)],
      batchMutation: { ...state.batchMutation, status: 'error' },
    })),

  confirmBatchCreate: (response) =>
    set((state) => {
      const newNodesById = { ...state.nodesById }
      const newPending = { ...state.pendingNodes }
      let newNodeOrder = [...state.nodeOrder]

      for (const created of response.created) {
        const { tempId, ...node } = created
        delete newPending[tempId]
        newNodesById[node.id] = node
        newNodeOrder.push(node.id)
      }

      return {
        nodesById: newNodesById,
        nodeOrder: newNodeOrder,
        pendingNodes: newPending,
        board: state.board ? { ...state.board, revision: response.boardRevision } : null,
        sync: { ...state.sync, lastSyncedRevision: response.boardRevision },
        batchMutation: INITIAL_BATCH,
      }
    }),

  rollbackBatchCreate: () =>
    set((state) => {
      const newPending = { ...state.pendingNodes }
      for (const tempId of state.batchMutation.affectedNodeIds) {
        delete newPending[tempId]
      }
      return {
        pendingNodes: newPending,
        batchMutation: { ...state.batchMutation, status: 'error' },
      }
    }),

  resetBatchMutation: () =>
    set({ batchMutation: INITIAL_BATCH }),

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

  // ─── Chat Actions ─────────────────────────────────────────────────────────

  loadChatHistory: (messages: ChatMessage[]) =>
    set((state) => ({
      chatState: { ...state.chatState, messages, loadStatus: 'ready' },
    })),

  setChatLoadStatus: (status) =>
    set((state) => ({
      chatState: { ...state.chatState, loadStatus: status },
    })),

  appendChatMessage: (message: ChatMessage) =>
    set((state) => ({
      chatState: { ...state.chatState, messages: [...state.chatState.messages, message] },
    })),

  appendChatMessages: (messages: ChatMessage[]) =>
    set((state) => ({
      chatState: { ...state.chatState, messages: [...state.chatState.messages, ...messages] },
    })),

  setChatSendStatus: (status) =>
    set((state) => ({
      chatState: { ...state.chatState, sendStatus: status },
    })),

  setChatDraftText: (text: string) =>
    set((state) => ({
      chatState: { ...state.chatState, draftText: text },
    })),

  setChatLastError: (error: string | null) =>
    set((state) => ({
      chatState: { ...state.chatState, lastError: error },
    })),

  // ─── Agent Actions ────────────────────────────────────────────────────────

  setSuggestStatus: (status) =>
    set((state) => ({
      agentState: { ...state.agentState, suggestStatus: status },
    })),

  setLatestSuggestion: (suggestion: AgentSuggestion) =>
    set((state) => ({
      agentState: {
        ...state.agentState,
        latestSuggestion: suggestion,
        previewVisible: true,
        previewStale: false,
        suggestStatus: 'idle',
        suggestError: null,
      },
    })),

  clearSuggestion: () =>
    set((state) => ({
      agentState: {
        ...state.agentState,
        latestSuggestion: null,
        previewVisible: false,
        previewStale: false,
      },
    })),

  setSuggestError: (error) =>
    set((state) => ({
      agentState: { ...state.agentState, suggestError: error, suggestStatus: error ? 'error' : 'idle' },
    })),

  setPreviewStale: (stale: boolean) =>
    set((state) => ({
      agentState: { ...state.agentState, previewStale: stale },
    })),

  // ─── Apply Actions ──────────────────────────────────────────────────────────

  setApplyStatus: (status) =>
    set((state) => ({
      agentState: { ...state.agentState, applyStatus: status },
    })),

  setApplyError: (error) =>
    set((state) => ({
      agentState: { ...state.agentState, applyError: error, applyStatus: error ? 'error' : 'idle' },
    })),

  clearApplyState: () =>
    set((state) => ({
      agentState: { ...state.agentState, applyStatus: 'idle', applyError: null },
    })),

  reconcileApply: (response: ApplyResponse) =>
    set((state) => {
      const nodesById: Record<string, BoardNode> = {}
      const nodeOrder: string[] = []
      for (const node of response.updatedBoard.nodes) {
        nodesById[node.id] = node
        nodeOrder.push(node.id)
      }

      const edgesById: Record<string, BoardEdge> = {}
      const edgeOrder: string[] = []
      for (const edge of response.updatedBoard.edges) {
        edgesById[edge.id] = edge
        edgeOrder.push(edge.id)
      }

      return {
        nodesById,
        edgesById,
        nodeOrder,
        edgeOrder,
        board: state.board ? { ...state.board, revision: response.boardRevision } : null,
        sync: { ...state.sync, lastSyncedRevision: response.boardRevision },
        agentState: {
          ...state.agentState,
          latestSuggestion: null,
          previewVisible: false,
          previewStale: false,
          applyStatus: 'success',
          applyError: null,
        },
      }
    }),
}))

// T039: Stale detection — watch for board revision changes
let _lastRevision: number | undefined
useBoardStore.subscribe((state) => {
  const newRevision = state.board?.revision
  if (newRevision !== undefined && _lastRevision !== undefined && newRevision !== _lastRevision) {
    if (
      state.agentState.latestSuggestion &&
      state.agentState.latestSuggestion.boardRevision < newRevision &&
      !state.agentState.previewStale
    ) {
      useBoardStore.getState().setPreviewStale(true)
    }
  }
  _lastRevision = newRevision
})
