# Quickstart: Node Batch Mutations

**Feature**: 007-node-batch-mutations
**Date**: 2026-03-16

## Prerequisites

- Node.js LTS (20+)
- PostgreSQL 15+ running locally with migrations applied
- Backend running (`npm run dev` in `backend/`)
- Frontend running (`npm run dev` in `frontend/`)
- At least one board created with several nodes (for testing batch updates/deletes)

## Key Files to Understand First

| File | What it does |
|------|-------------|
| `backend/src/db/tx.ts` | `withBoardMutation` — atomic transaction wrapper with advisory lock, revision bump, ops logging |
| `backend/src/services/nodes.service.ts` | Single-node create/update/delete — the inner logic will be extracted as helpers for batch reuse |
| `backend/src/domain/operations/operation-factory.ts` | `buildOperation` — creates operation log entries; already supports `batchId` parameter |
| `backend/src/schemas/node.schemas.ts` | `CreateNodeRequestSchema`, `UpdateNodeRequestSchema` — reused for per-item validation in batch |
| `backend/src/domain/validation/node-rules.ts` | Content validation, lock checks, existence checks — reused per-item in batch |
| `frontend/src/store/board.store.ts` | Zustand normalized store — needs batch-aware optimistic/rollback actions |
| `frontend/src/hooks/useNodeMutations.ts` | Single-node mutation hook — batch hook follows the same pattern |

## Development Sequence

### 1. Backend: Extract in-transaction helpers from nodes.service.ts

Refactor `nodes.service.ts` to export inner helpers that accept a `PoolClient` and `Board`:

```typescript
export async function createNodeInTx(client: PoolClient, board: Board, data: CreateNodeRequest): Promise<Node>
export async function updateNodeInTx(client: PoolClient, board: Board, nodeId: string, patch: UpdateNodeRequest): Promise<Node>
export async function deleteNodeInTx(client: PoolClient, board: Board, nodeId: string): Promise<{ deletedNodeId: string; deletedEdgeIds: string[] }>
```

The existing public functions (`createNode`, `updateNode`, `deleteNode`) become thin wrappers that call `withBoardMutation` and delegate to these helpers.

### 2. Backend: Add batch domain rules and temp-ID map

Create `domain/validation/batch-rules.ts`:
- `validateBatchSize(operations)` — assert 1 ≤ length ≤ MAX
- `validateNoDuplicateTempIds(operations)` — scan create items for collisions

Create `domain/ids/temp-id-map.ts`:
- `TempIdMap` class with `register(tempId, realId)`, `resolve(idOrTempId)`, `has(tempId)`

### 3. Backend: Add batch Zod schemas

Create `schemas/batch.schemas.ts`:
- `BatchCreateItemSchema`, `BatchUpdateItemSchema`, `BatchDeleteItemSchema`
- `BatchRequestSchema` (discriminated union on `type`)
- `BatchResponseSchema`

### 4. Backend: Implement batch.service.ts

Core function: `executeBatch(boardId: string, operations: BatchOperationItem[])`
- Uses `withBoardMutation(boardId, ...)`
- Iterates operations in order
- For each: validates, executes via in-tx helpers, collects results and operation entries
- Returns `{ batchId, boardRevision, created, updated, deleted }`

### 5. Backend: Add controller route and handler

Add handler in `nodes.controller.ts` (or dedicated batch handler):
- Parse + validate request body with `BatchRequestSchema`
- Call `batch.service.executeBatch()`
- Return response in standard envelope

Register route in `router.ts`:
- `POST /api/boards/:boardId/nodes/batch`

### 6. Backend: Tests

- Unit: `batch-rules.unit.test.ts`, `temp-id-map.unit.test.ts`
- Integration: `batch.integration.test.ts` (happy path, rollback, cascade, temp IDs, locked nodes, 0 ops, >200 ops)
- Contract: `batch.contract.test.ts` (HTTP-level request/response shapes)

### 7. Frontend: API function

Add to `nodes.api.ts`:
```typescript
export async function batchNodeMutations(boardId: string, operations: BatchOperationItem[]): Promise<ApiResult<BatchResponse>>
```

### 8. Frontend: Store actions

Add to `board.store.ts`:
- `batchMoveOptimistic(moves: Array<{ nodeId, x, y }>)` — returns snapshots for rollback
- `batchDeleteOptimistic(nodeIds: string[])` — returns snapshots for rollback
- `reconcileBatch(response: BatchResponse)` — apply server diff, update revision
- `rollbackBatch(snapshots)` — restore all from snapshots

### 9. Frontend: Batch mutations hook

Create `hooks/useBatchNodeMutations.ts`:
- `batchMoveNodes(moves)` — optimistic move all → API call → reconcile or rollback
- `batchDeleteNodes(nodeIds)` — optimistic delete all → API call → reconcile or rollback
- `batchCreateNodes(items)` — add pending nodes → API call → confirm all or rollback

### 10. Frontend: Integrate multi-select drag

Modify `useNodeDrag.ts`:
- When releasing a multi-select drag, collect all selected node IDs + new positions
- Call `batchMoveNodes()` instead of individual `updateNodePosition()` calls

## Verifying Your Work

```bash
# Run backend tests
cd backend && npm test

# Run specific batch tests
cd backend && npx vitest run tests/integration/batch.integration.test.ts

# Manual API test (requires board with nodes)
curl -X POST http://localhost:3001/api/boards/{boardId}/nodes/batch \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      { "type": "create", "tempId": "tmp-1", "node": { "type": "sticky", "x": 100, "y": 100, "width": 200, "height": 120, "content": { "text": "Batch test" } } },
      { "type": "update", "nodeId": "tmp-1", "changes": { "x": 300 } }
    ]
  }'
```
