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

export interface UIState {
  chatSidebarOpen: boolean
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

export interface BoardListItem {
  id: string
  title: string
  status: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export interface BoardStore {
  boardId: string | null
  board: BoardMeta | null
  nodesById: Record<string, BoardNode>
  edgesById: Record<string, BoardEdge>
  nodeOrder: string[]
  edgeOrder: string[]
  chatThread: ChatThreadRef | null
  ui: UIState
  sync: SyncState

  hydrate: (data: HydrateBoardData) => void
  reset: () => void
  setHydrateStatus: (status: SyncState['hydrateStatus']) => void
  setError: (error: SyncError) => void
  toggleChatSidebar: () => void
}

export interface HydrateBoardData {
  board: BoardMeta
  nodes: BoardNode[]
  edges: BoardEdge[]
  chatThread: ChatThreadRef | null
}
