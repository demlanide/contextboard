# Data Model: Frontend Foundation

**Feature**: 004-frontend-foundation
**Date**: 2026-03-16

## Overview

The frontend data model defines the client-side store shape. This is not
a database schema — the backend owns all persistence. This model defines
what the frontend stores in memory after hydrating from the backend and
how that state is structured for rendering and future slice extension.

The store shape follows the guidance in `documentation/frontend-state-sync.md`.

## Store Shape

### BoardStore

The top-level store for the board workspace. One instance active at a time
(the currently viewed board).

```typescript
interface BoardStore {
  boardId: string | null;

  board: BoardMeta | null;

  nodesById: Record<string, BoardNode>;
  edgesById: Record<string, BoardEdge>;

  nodeOrder: string[];
  edgeOrder: string[];

  chatThread: ChatThreadRef | null;

  ui: UIState;
  sync: SyncState;
}
```

### BoardMeta

Board metadata from the hydration response.

```typescript
interface BoardMeta {
  id: string;
  title: string;
  description: string | null;
  status: 'active' | 'archived' | 'deleted';
  viewportState: ViewportState;
  settings: BoardSettings;
  summary: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
```

### BoardNode

Node entity from the hydration response. Stored but not rendered in this
slice.

```typescript
interface BoardNode {
  id: string;
  boardId: string;
  type: 'sticky' | 'text' | 'image' | 'shape';
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  locked: boolean;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### BoardEdge

Edge entity from the hydration response. Stored but not rendered in this
slice.

```typescript
interface BoardEdge {
  id: string;
  boardId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### ChatThreadRef

Reference to the board's chat thread. Full chat message loading is
deferred to S8.

```typescript
interface ChatThreadRef {
  id: string;
  boardId: string;
}
```

### ViewportState

```typescript
interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}
```

### BoardSettings

```typescript
interface BoardSettings {
  gridEnabled: boolean;
  snapToGrid: boolean;
  agentEditMode: 'suggest' | 'apply';
}
```

### UIState

Local-only UI state. Never sent to or received from the backend.

```typescript
interface UIState {
  chatSidebarOpen: boolean;
}
```

### SyncState

Tracks hydration and request lifecycle.

```typescript
interface SyncState {
  hydrateStatus: 'idle' | 'loading' | 'ready' | 'error';
  lastSyncedRevision: number | null;
  lastError: SyncError | null;
}

interface SyncError {
  code: string;
  message: string;
  retryable: boolean;
}
```

## Entity Relationships

```text
BoardStore
  └── board: BoardMeta (1:1, nullable until hydrated)
  └── nodesById: Record<id, BoardNode> (1:N, from hydration)
  └── edgesById: Record<id, BoardEdge> (1:N, from hydration)
  └── chatThread: ChatThreadRef (1:1, nullable until hydrated)
  └── ui: UIState (local only)
  └── sync: SyncState (local only)
```

## Board List Model

The starting screen uses a separate, simpler data shape.

```typescript
interface BoardListItem {
  id: string;
  title: string;
  status: 'active' | 'archived';
  updatedAt: string;
  createdAt: string;
}
```

This is derived from the `GET /boards` response. Deleted boards are
excluded by the backend.

## Hydration Flow — State Transitions

```text
1. Route enters /boards/:boardId
2. sync.hydrateStatus = 'loading'
3. boardId set in store
4. API call: GET /boards/{boardId}/state
5a. On success:
    - board = response.data.board
    - nodesById = normalize(response.data.nodes)
    - edgesById = normalize(response.data.edges)
    - chatThread = response.data.chatThread
    - nodeOrder = response.data.nodes.map(n => n.id)
    - edgeOrder = response.data.edges.map(e => e.id)
    - sync.lastSyncedRevision = response.data.board.revision
    - sync.hydrateStatus = 'ready'
    - sync.lastError = null
5b. On 404 error:
    - sync.hydrateStatus = 'error'
    - sync.lastError = { code: 'BOARD_NOT_FOUND', message: '...', retryable: false }
5c. On network/timeout error:
    - sync.hydrateStatus = 'error'
    - sync.lastError = { code: 'NETWORK_ERROR', message: '...', retryable: true }
5d. On other error:
    - sync.hydrateStatus = 'error'
    - sync.lastError = { code: 'UNKNOWN_ERROR', message: '...', retryable: true }
```

## Store Reset

When navigating away from a board (back to starting screen), the store
resets to initial state:

```text
boardId = null
board = null
nodesById = {}
edgesById = {}
nodeOrder = []
edgeOrder = []
chatThread = null
ui = { chatSidebarOpen: true }
sync = { hydrateStatus: 'idle', lastSyncedRevision: null, lastError: null }
```

## Extension Points for Later Slices

The store shape is designed to be extended without restructuring:

- **S4 Nodes CRUD**: Add `ui.selectedNodeIds`, `ui.editingNodeId`,
  `ui.dragging`. Mutation helpers update `nodesById` from server response.
- **S5 Edges CRUD**: Add `ui.selectedEdgeIds`. Mutation helpers update
  `edgesById` from server response.
- **S8 Chat**: Add `agent` slice for prompt draft, suggestion, preview.
  `chatThread` already holds the thread reference.
- **S11 Operations Polling**: `sync.lastSyncedRevision` is already the
  polling checkpoint. Add `sync.inFlightMutations` and `sync.stale`.
