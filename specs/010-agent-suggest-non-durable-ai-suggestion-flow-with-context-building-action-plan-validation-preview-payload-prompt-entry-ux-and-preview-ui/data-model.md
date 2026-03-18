# Data Model: Agent Suggest

## Database Changes

**No new tables or migrations required.** The suggest flow reads existing tables (boards, nodes, edges, assets, chat_threads, chat_messages) and writes only to `chat_messages` using the S8 persistence pattern.

## Entities (Backend Types)

### AgentContextSnapshot

Server-side typed DTO sent to the LLM. Built by `agent/context-builder.ts`.

```typescript
interface AgentContextSnapshot {
  meta: {
    boardId: string
    boardRevision: number
    mode: 'suggest'
    requestId: string
    generatedAt: string              // ISO 8601
    limits: ContextLimits
  }
  board: {
    title: string
    summary: BoardSummary | null
    viewport: Viewport | null
  }
  selection: {
    selectedNodeIds: string[]
    selectedEdgeIds: string[]
  }
  nodes: {
    selected: NodeProjection[]
    nearby: NodeProjection[]
    visible: NodeProjection[]
  }
  edges: {
    selected: EdgeProjection[]
    visible: EdgeProjection[]
  }
  assets: {
    referenced: AssetProjection[]
  }
  artifacts: {
    systemNotes: SystemNote[]
  }
  sanitization: {
    piiRemoved: boolean
    secretsRedacted: boolean
    redactionSummary: RedactionEntry[]
  }
}

interface ContextLimits {
  maxTokensTotal: number       // default 8000
  maxTokensContent: number     // default 6000
  maxSelectedNodes: number     // default 50
  maxNearbyNodes: number       // default 100
  maxVisibleNodes: number      // default 200
  maxEdges: number             // default 200
  maxActionItems: number       // default 200
}
```

### NodeProjection

LLM-friendly shape projected from full node rows. No raw binary content.

```typescript
interface NodeProjection {
  id: string
  type: 'sticky' | 'text' | 'image' | 'shape'
  geometry: {
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }
  zIndex: number
  content: {
    text: string | null         // truncated if needed
  }
  metadata: {
    locked: boolean
    hidden: boolean
    aiGenerated: boolean
    tags: string[]
  }
  provenance: {
    source: 'user' | 'agent' | 'system'
    updatedAt: string           // ISO 8601
  }
}
```

### EdgeProjection

```typescript
interface EdgeProjection {
  id: string
  sourceNodeId: string
  targetNodeId: string
  label: string | null
  edgeType: string
}
```

### AssetProjection

Metadata-only. No binary data (FR-027).

```typescript
interface AssetProjection {
  id: string
  nodeId: string
  thumbnailUrl: string | null
  aiCaption: string | null
  extractedText: string | null
  processingStatus: 'ready' | 'processing' | 'failed'
}
```

### ClusterSummary

Replaces dropped nodes when truncation removes entire nodes.

```typescript
interface ClusterSummary {
  scope: 'nearby' | 'visible'
  count: number
  themes: string[]
  sampleNodeIds: string[]
  confidence: number
  provenance: { source: 'system'; updatedAt: string }
}
```

### RedactionEntry

```typescript
interface RedactionEntry {
  kind: 'email' | 'token' | 'url' | 'other'
  count: number
}
```

## Entities (LLM Output — Validated)

### LLMRawResponse

Raw shape returned by the model, before validation.

```typescript
interface LLMRawResponse {
  explanation: string
  confidence: number
  actionPlan: unknown[]         // validated into ActionPlanItem[]
  preview: unknown              // validated into PreviewPayload
}
```

### ActionPlanItem

Validated action plan item. Discriminated union on `type`.

```typescript
type ActionPlanItem =
  | ActionPlanCreateNode
  | ActionPlanUpdateNode
  | ActionPlanDeleteNode
  | ActionPlanCreateEdge
  | ActionPlanUpdateEdge
  | ActionPlanDeleteEdge
  | ActionPlanBatchLayout

interface ActionPlanCreateNode {
  type: 'create_node'
  tempId: string
  node: {
    type: 'sticky' | 'text' | 'image' | 'shape'
    x: number
    y: number
    width: number
    height: number
    content: { text: string }
    style: Record<string, unknown>
    metadata: { aiGenerated: true }
  }
}

interface ActionPlanUpdateNode {
  type: 'update_node'
  nodeId: string                // must exist, not deleted, not locked, same board
  patch: {
    x?: number
    y?: number
    width?: number
    height?: number
    content?: { text?: string }
    style?: Record<string, unknown>
  }
}

interface ActionPlanDeleteNode {
  type: 'delete_node'
  nodeId: string                // must exist, not deleted, not locked, same board
}

interface ActionPlanCreateEdge {
  type: 'create_edge'
  tempId: string
  edge: {
    sourceNodeId: string        // existing ID or tempId from a prior create_node
    targetNodeId: string        // existing ID or tempId from a prior create_node
    label?: string
    edgeType?: string
  }
}

interface ActionPlanUpdateEdge {
  type: 'update_edge'
  edgeId: string                // must exist, not deleted, same board
  patch: {
    label?: string
    edgeType?: string
  }
}

interface ActionPlanDeleteEdge {
  type: 'delete_edge'
  edgeId: string                // must exist, not deleted, same board
}

interface ActionPlanBatchLayout {
  type: 'batch_layout'
  items: Array<{
    nodeId: string              // must exist, not deleted, not locked, same board
    x: number
    y: number
  }>
}
```

### PreviewPayload

Metadata describing what the plan would affect.

```typescript
interface PreviewPayload {
  affectedNodeIds: string[]     // existing nodes targeted by update/delete/batch_layout
  affectedEdgeIds: string[]     // existing edges targeted by update/delete
  newNodeTempIds: string[]      // temp IDs from create_node
  newEdgeTempIds: string[]      // temp IDs from create_edge
}
```

## Entities (Suggest Request / Response — API Layer)

### SuggestRequest

Matches OpenAPI `AgentActionsRequest` with `mode: 'suggest'`.

```typescript
interface SuggestRequest {
  prompt: string                // 1–20,000 chars
  mode: 'suggest'
  selectionContext?: {
    selectedNodeIds?: string[]
    selectedEdgeIds?: string[]
    viewport?: { x: number; y: number; zoom: number }
  }
}
```

### SuggestResponse

Matches OpenAPI `AgentActionsResponse`.

```typescript
interface SuggestResponse {
  data: {
    message: ChatMessage        // persisted agent message with explanation text
    actionPlan: ActionPlanItem[] // validated plan (may be empty)
    preview: PreviewPayload     // affected IDs (may be empty)
  }
  error: null
}
```

### SuggestErrorResponse

When model fails, returns user message with error.

```typescript
interface SuggestErrorResponse {
  data: {
    message: ChatMessage | null // agent message with explanation only (no plan), or null
    actionPlan: []
    preview: { affectedNodeIds: [], affectedEdgeIds: [], newNodeTempIds: [], newEdgeTempIds: [] }
  }
  error: {
    code: string                // e.g. 'AGENT_TIMEOUT', 'ACTION_PLAN_INVALID', 'AGENT_UNAVAILABLE'
    message: string
    details: Record<string, unknown>
  }
}
```

## Entities (Frontend Store)

### Agent Slice (in board store)

```typescript
interface AgentState {
  suggestStatus: 'idle' | 'running' | 'error'
  latestSuggestion: {
    message: ChatMessage
    actionPlan: ActionPlanItem[]
    preview: PreviewPayload
    boardRevision: number       // revision at which suggestion was generated
  } | null
  previewVisible: boolean
  previewStale: boolean
  suggestError: SyncError | null
}
```

Preview nodes/edges are derived at render time from `latestSuggestion.actionPlan` — never stored in `nodesById` or `edgesById`.

## Validation Rules

### Suggest request (request boundary — Zod)

- `prompt`: required, string, 1–20,000 characters
- `mode`: required, literal `'suggest'`
- `selectionContext`: optional object; if provided:
  - `selectedNodeIds`: optional array of UUID strings (max 100)
  - `selectedEdgeIds`: optional array of UUID strings (max 100)
  - `viewport`: optional object with `x` (number), `y` (number), `zoom` (positive number)

### Suggest request (domain boundary)

- Board must exist and not be deleted (404 `BOARD_NOT_FOUND`)
- Board must not be archived (409 `BOARD_ARCHIVED`)
- Chat thread must exist for board (integrity check)

### Action plan output (agent output boundary)

- **Schema**: parsed against Zod discriminated union on `type`
- **Action types**: must be in allow-list: `create_node`, `update_node`, `delete_node`, `create_edge`, `update_edge`, `delete_edge`, `batch_layout`
- **Plan size**: `actionPlan.length` ≤ 200
- **Reference existence**: all referenced node/edge IDs must exist, not be deleted, and belong to the same board
- **Locked nodes**: `update_node`, `delete_node`, and `batch_layout` items must not target locked nodes
- **Rejection policy**: if ANY item fails validation, the ENTIRE plan is rejected

### No mutation side effects

- Suggest does NOT increment board revision
- Suggest does NOT write `board_operations` entries
- Suggest does NOT acquire the per-board advisory lock
- Suggest writes only to `chat_messages` (user message + agent message)

## Relationships

```text
boards 1──* nodes              (read by context builder)
boards 1──* edges              (read by context builder)
boards 1──* assets             (read by context builder for metadata)
boards 1──1 chat_threads 1──* chat_messages  (write: user prompt + agent response)
```

No new foreign keys or constraints introduced. All reads use existing queries plus new spatial/filter helpers in repos.
