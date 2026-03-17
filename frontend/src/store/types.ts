export interface BoardMeta {
  id: string
  title: string
  description: string | null
  status: 'active' | 'archived' | 'deleted'
  viewportState: ViewportState
  settings: BoardSettings
  summary: Record<string, unknown>
  revision: number
  createdAt: string
  updatedAt: string
}

export interface BoardNode {
  id: string
  boardId: string
  type: 'sticky' | 'text' | 'image' | 'shape'
  parentId: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  content: Record<string, unknown>
  style: Record<string, unknown>
  metadata: Record<string, unknown>
  locked: boolean
  hidden: boolean
  createdAt: string
  updatedAt: string
}

export interface BoardEdge {
  id: string
  boardId: string
  sourceNodeId: string
  targetNodeId: string
  label: string | null
  style: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ChatThreadRef {
  id: string
  boardId: string
}

export interface ViewportState {
  x: number
  y: number
  zoom: number
}

export interface BoardSettings {
  gridEnabled: boolean
  snapToGrid: boolean
  agentEditMode: 'suggest' | 'apply'
}

export interface ConnectionDragState {
  sourceNodeId: string
  cursorX: number
  cursorY: number
  hoveredTargetId: string | null
  isValid: boolean
}

export interface UIState {
  chatSidebarOpen: boolean
  placementMode: BoardNode['type'] | null
  selectedNodeIds: string[]
  editingNodeId: string | null
  selectedEdgeId: string | null
  connectionDrag: ConnectionDragState | null
}

export interface PendingNode {
  tempId: string
  node: Partial<BoardNode>
  status: 'pending' | 'failed'
  error?: string
}

export interface SyncState {
  hydrateStatus: 'idle' | 'loading' | 'ready' | 'error'
  lastSyncedRevision: number | null
  lastError: SyncError | null
}

export interface SyncError {
  code: string
  message: string
  retryable: boolean
}

export interface BoardAsset {
  id: string
  boardId: string | null
  kind: string
  mimeType: string | null
  originalFilename: string | null
  url: string
  thumbnailUrl: string | null
  fileSizeBytes: number | null
  width: number | null
  height: number | null
  processingStatus: string
  extractedText: string | null
  aiCaption: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface BoardListItem {
  id: string
  title: string
  status: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export interface BatchMutationState {
  status: 'idle' | 'pending' | 'error'
  affectedNodeIds: string[]
  snapshots: Record<string, BoardNode>
  edgeSnapshots: Record<string, BoardEdge>
  error: string | null
}

export interface BoardStore {
  boardId: string | null
  board: BoardMeta | null
  nodesById: Record<string, BoardNode>
  edgesById: Record<string, BoardEdge>
  nodeOrder: string[]
  edgeOrder: string[]
  assetsById: Record<string, BoardAsset>
  chatThread: ChatThreadRef | null
  pendingNodes: Record<string, PendingNode>
  nodeMutationStatus: Record<string, 'pending' | 'confirmed' | 'failed'>
  batchMutation: BatchMutationState
  ui: UIState
  sync: SyncState

  hydrate: (data: HydrateBoardData) => void
  addAsset: (asset: BoardAsset) => void
  reset: () => void
  setHydrateStatus: (status: SyncState['hydrateStatus']) => void
  setError: (error: SyncError) => void
  toggleChatSidebar: () => void

  // Node CRUD actions
  setPlacementMode: (mode: BoardNode['type'] | null) => void
  setSelectedNodeIds: (ids: string[]) => void
  setEditingNodeId: (id: string | null) => void

  // Optimistic create
  addPendingNode: (tempId: string, node: Partial<BoardNode>) => void
  confirmNode: (tempId: string, serverNode: BoardNode, boardRevision: number) => void
  rollbackPendingNode: (tempId: string) => void

  // Optimistic update
  updateNodeOptimistic: (nodeId: string, patch: Partial<BoardNode>) => void
  confirmNodeUpdate: (nodeId: string, serverNode: BoardNode, boardRevision: number) => void
  rollbackNodeUpdate: (nodeId: string, snapshot: BoardNode) => void
  setNodePosition: (nodeId: string, x: number, y: number) => void

  // Optimistic delete
  deleteNodeOptimistic: (nodeId: string) => { node: BoardNode; edges: BoardEdge[] } | null
  undoDeleteNode: (snapshot: { node: BoardNode; edges: BoardEdge[] }) => void
  confirmNodeDelete: (nodeId: string, deletedEdgeIds: string[], boardRevision: number) => void

  // Mutation status
  clearNodeMutationStatus: (nodeId: string) => void

  // Batch mutations
  batchMoveOptimistic: (moves: Array<{ nodeId: string; x: number; y: number }>) => void
  batchCreateOptimistic: (items: Array<{ tempId: string; node: Partial<BoardNode> }>) => void
  batchDeleteOptimistic: (nodeIds: string[]) => { nodeSnapshots: Record<string, BoardNode>; edgeSnapshots: Record<string, BoardEdge> }
  reconcileBatch: (response: { boardRevision: number; created: (BoardNode & { tempId: string })[]; updated: BoardNode[]; deleted: Array<{ id: string; type: 'node' | 'edge' }> }) => void
  rollbackBatch: () => void
  rollbackBatchDelete: (nodeSnapshots: Record<string, BoardNode>, edgeSnapshots: Record<string, BoardEdge>) => void
  confirmBatchCreate: (response: { boardRevision: number; created: (BoardNode & { tempId: string })[] }) => void
  rollbackBatchCreate: () => void
  resetBatchMutation: () => void

  // Edge CRUD actions
  setSelectedEdgeId: (id: string | null) => void
  setConnectionDrag: (state: ConnectionDragState | null) => void

  // Optimistic edge create
  addEdgeOptimistic: (tempId: string, edge: BoardEdge) => void
  confirmEdge: (tempId: string, serverEdge: BoardEdge, boardRevision: number) => void
  rollbackEdge: (tempId: string) => void

  // Optimistic edge update
  updateEdgeOptimistic: (edgeId: string, patch: Partial<BoardEdge>) => void
  confirmEdgeUpdate: (edgeId: string, serverEdge: BoardEdge, boardRevision: number) => void
  rollbackEdgeUpdate: (edgeId: string, snapshot: BoardEdge) => void

  // Optimistic edge delete
  removeEdgeOptimistic: (edgeId: string) => { edge: BoardEdge } | null
  confirmEdgeDelete: (edgeId: string, boardRevision: number) => void
  undoEdgeDelete: (snapshot: { edge: BoardEdge }) => void
}

export interface HydrateBoardData {
  board: BoardMeta
  nodes: BoardNode[]
  edges: BoardEdge[]
  assets?: BoardAsset[]
  chatThread: ChatThreadRef | null
}
