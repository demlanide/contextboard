# Tasks: Node Batch Mutations

**Input**: Design documents from `/specs/007-node-batch-mutations/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/batch-endpoint.md, quickstart.md

**Tests**: Included in the final phase. The plan structures five test files (unit: batch-rules, temp-id-map; integration: batch; contract: batch; frontend unit: batch-mutations). Tests are generated as a dedicated phase after all user stories are complete.

**Organization**: Tasks are grouped by user story. Backend work is consolidated in Phase 2 as a blocking prerequisite because all five user stories depend on the single `POST /boards/:boardId/nodes/batch` endpoint. Frontend stories (US1–US5) each add specific grouped-action support and reconciliation behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/` at repository root (per plan.md project structure)

---

## Phase 1: Setup

**Purpose**: Configuration updates that must be in place before batch endpoint implementation.

- [x] T001 Add batch limits to backend/src/config/limits.ts — add `batch` section with `maxOperations: 200`, `minOperations: 1`; export as typed constants; these are referenced by batch validation rules and request schema

---

## Phase 2: Foundational (Backend — Batch Endpoint)

**Purpose**: Complete backend batch endpoint infrastructure. The single `POST /boards/:boardId/nodes/batch` endpoint handles all operation types (create, update, delete) in ordered, atomic execution. This MUST be complete before any frontend batch story can be end-to-end tested.

**⚠️ CRITICAL**: No frontend user story can be end-to-end verified until this phase is complete.

- [x] T002 [P] Refactor backend/src/services/nodes.service.ts — extract in-transaction helpers into exported functions: `createNodeInTx(client, board, data): Promise<Node>` (validate content, insert, return node), `updateNodeInTx(client, board, nodeId, patch): Promise<{ node, changes, previous }>` (load node, assert exists + unlocked, merge-patch, validate content, update, return node with change record), `deleteNodeInTx(client, board, nodeId): Promise<{ deletedNodeId, deletedEdgeIds, previousState }>` (load node, assert exists + unlocked, soft-delete node, cascade-delete edges, return IDs); existing public `createNode`/`updateNode`/`deleteNode` become thin wrappers calling `withBoardMutation` + the corresponding in-tx helper + `buildOperation`; per research.md Decision 2
- [x] T003 [P] Create batch validation rules in backend/src/domain/validation/batch-rules.ts — export `BatchValidationError` (extends Error with code and details); export `validateBatchSize(operations, limits)` that asserts `operations.length >= limits.minOperations && <= limits.maxOperations`, throws BatchValidationError with count details on violation; export `validateNoDuplicateTempIds(operations)` that scans create items, collects tempId values, throws BatchValidationError with the duplicate tempId if any collision found; per spec FR-009, FR-010, FR-011
- [x] T004 [P] Create temp-ID registry in backend/src/domain/ids/temp-id-map.ts — export `TempIdMap` class with: `register(tempId: string, realId: string): void` (stores mapping, throws if tempId already registered), `resolve(idOrTempId: string): string` (returns realId if tempId exists in map, otherwise returns idOrTempId unchanged), `has(tempId: string): boolean`; the map is request-scoped (one instance per batch execution); per research.md Decision 3
- [x] T005 [P] Create Zod batch schemas in backend/src/schemas/batch.schemas.ts — import `CreateNodeRequestSchema` and `UpdateNodeRequestSchema` from node.schemas; define `BatchCreateItemSchema` (type literal 'create', tempId string, node CreateNodeRequestSchema); define `BatchUpdateItemSchema` (type literal 'update', nodeId string, changes UpdateNodeRequestSchema); define `BatchDeleteItemSchema` (type literal 'delete', nodeId string uuid); define `BatchOperationItemSchema` as discriminated union on `type`; define `BatchRequestSchema` with operations array of BatchOperationItemSchema; define `BatchResponseSchema` with batchId uuid, boardRevision int, created array (NodeSchema + tempId string), updated array (NodeSchema), deleted array of {id uuid, type enum('node','edge')}; per contracts/batch-endpoint.md
- [x] T006 Create backend/src/services/batch.service.ts — export `executeBatch(boardId, operations)`: use `withBoardMutation(boardId, ...)` for single transaction with advisory lock; validate batch size via `validateBatchSize` and duplicate temp IDs via `validateNoDuplicateTempIds`; assert board editable; create `TempIdMap` instance and generate `batchId` UUID; iterate operations in order: for create → call `createNodeInTx`, register tempId→realId in map, collect result into `created` array + build `create_node` operation; for update → resolve nodeId through tempIdMap, call `updateNodeInTx`, collect into `updated` array + build `update_node` operation; for delete → call `deleteNodeInTx`, collect nodeId into `deleted` as type:'node', collect cascaded edgeIds as type:'edge' + build `delete_node` and `delete_edge` operations; compute newRevision = board.revision + 1; set batchId on all operation entries; return `{ batchId, boardRevision: newRevision, created, updated, deleted }` with operations array and newRevision for withBoardMutation; depends on T002–T005
- [x] T007 Add batch handler to backend/src/http/controllers/nodes.controller.ts — import `BatchRequestSchema` from batch.schemas, `executeBatch` from batch.service; implement `handleBatchNodeMutations(req, res, next)` that parses boardId from params (validate UUID), validates body with BatchRequestSchema, calls executeBatch, returns 200 with successResponse containing batchId, boardRevision, created (with tempId attached), updated, deleted; follow error handling pattern from existing handlers (let errors propagate to next); depends on T005, T006
- [x] T008 Register batch route in backend/src/http/router.ts — add `POST /api/boards/:boardId/nodes/batch` with `idempotencyMiddleware('batch_node_mutations')` and `handleBatchNodeMutations` handler; import handler from nodes.controller; place after existing single-node routes; depends on T007
- [x] T009 Update backend/src/http/middleware/error-handler.ts — add handling for `BatchValidationError` (return 422 with VALIDATION_ERROR code and details from error); import error class from batch-rules.ts; depends on T003

**Checkpoint**: Batch endpoint works end-to-end. Verify with curl: create 3 nodes in one batch with temp IDs, update 2 nodes in one batch, delete 1 node with cascade, mixed create+update+delete in one batch. Board revision increments once per batch. Operations logged with shared batchId.

---

## Phase 3: User Story 1 — Multi-Node Rearrange (Priority: P1) 🎯 MVP

**Goal**: User selects several nodes and drags them to new positions. All position changes submit as a single batch. Either every node moves or none do.

**Independent Test**: Select 3+ nodes on a board, drag the group to new positions, release. All nodes land at new positions in one server round-trip. Reload — positions persist. Repeat with one invalid node ID injected — batch fails, all nodes revert.

### Implementation for User Story 1

- [x] T010 [P] [US1] Add batchNodeMutations API function to frontend/src/api/nodes.api.ts — export `batchNodeMutations(boardId: string, operations: BatchOperationItem[]): Promise<ApiResult<BatchResponse>>` calling POST /api/boards/{boardId}/nodes/batch with JSON body; define `BatchOperationItem` (discriminated union: create with tempId+node, update with nodeId+changes, delete with nodeId), `BatchResponse` (batchId, boardRevision, created, updated, deleted) and `BatchDeletedEntry` ({id, type}) interfaces
- [x] T011 [US1] Extend frontend/src/store/types.ts — add `BatchMutationState` interface with `status: 'idle' | 'pending' | 'error'`, `affectedNodeIds: string[]`, `snapshots: Record<string, BoardNode>`, `error: string | null`; add `batchMutation: BatchMutationState` to `BoardStore`; add `BatchResponse` and `BatchDeletedEntry` types matching the API response shape
- [x] T012 [US1] Extend frontend/src/store/board.store.ts — add initial `batchMutation: { status: 'idle', affectedNodeIds: [], snapshots: {}, error: null }` to state; implement `batchMoveOptimistic(moves: Array<{ nodeId: string, x: number, y: number }>): void` that snapshots all affected nodes into batchMutation.snapshots, applies new x/y to each node in nodesById, sets status='pending' and affectedNodeIds; implement `reconcileBatch(response: BatchResponse): void` that replaces updated nodes in nodesById with full server objects from response.updated, handles response.created (add to nodesById/nodeOrder with tempId→realId swap), removes response.deleted entries (nodes from nodesById/nodeOrder, edges from edgesById/edgeOrder based on entry type), updates board.revision and sync.lastSyncedRevision from response.boardRevision, resets batchMutation to idle; implement `rollbackBatch(): void` that restores all nodes from batchMutation.snapshots into nodesById, sets status='error'; update reset() to clear batchMutation; depends on T011
- [x] T013 [US1] Create frontend/src/hooks/useBatchNodeMutations.ts — export `useBatchNodeMutations()` hook; implement `batchMoveNodes(moves: Array<{ nodeId: string, x: number, y: number }>)`: call store.batchMoveOptimistic(moves), build operations array of type:'update' items with {x, y} changes, call batchNodeMutations API, on success call store.reconcileBatch(response), on failure call store.rollbackBatch(); return { batchMoveNodes }; depends on T010, T012
- [x] T014 [US1] Add multi-select support to frontend/src/components/canvas/Canvas.tsx — on click on a node with Shift held, toggle the node ID in selectedNodeIds (add if not present, remove if present); on click without Shift on a node, set selectedNodeIds to [nodeId]; on click on empty canvas, clear selectedNodeIds; render selection outline on all selected nodes; depends on existing Canvas.tsx and store.setSelectedNodeIds
- [x] T015 [US1] Modify frontend/src/hooks/useNodeDrag.ts — when drag starts on a selected node that is part of a multi-selection (selectedNodeIds.length > 1), track all selected node IDs; on pointermove, update positions for all selected nodes in store via setNodePosition; on pointerup with multi-selection, call useBatchNodeMutations.batchMoveNodes with all moved node positions instead of individual updateNodePosition; single-node drag (1 selected) continues to use existing single-node PATCH; depends on T013, T014

**Checkpoint**: Select 3 nodes (shift-click), drag them as a group, release. One network request fires. All 3 positions update from server response. Board revision bumps once. On batch failure, all 3 revert.

---

## Phase 4: User Story 2 — Batch Create Multiple Nodes (Priority: P1)

**Goal**: User triggers an action that creates several nodes at once. All creations submit as one batch with client temp IDs. Response maps each temp ID to a real UUID.

**Independent Test**: Trigger a multi-create action (e.g., duplicate selected nodes). All new nodes appear immediately. Reload — all persist with server-assigned IDs.

### Implementation for User Story 2

- [x] T016 [US2] Extend frontend/src/store/board.store.ts — implement `batchCreateOptimistic(items: Array<{ tempId: string, node: Partial<BoardNode> }>): void` that adds each item to pendingNodes with status='pending', sets batchMutation status='pending' and affectedNodeIds=[...tempIds]; implement `confirmBatchCreate(response: BatchResponse): void` that removes each created tempId from pendingNodes, adds full server node objects from response.created to nodesById/nodeOrder (keyed by real ID), updates board.revision; implement `rollbackBatchCreate(): void` that removes all tempIds from pendingNodes, resets batchMutation
- [x] T017 [US2] Extend frontend/src/hooks/useBatchNodeMutations.ts — add `batchCreateNodes(items: Array<{ tempId: string, type: BoardNode['type'], x: number, y: number, width: number, height: number, content: Record<string, unknown> }>)`: call store.batchCreateOptimistic with partial nodes, build operations array of type:'create' items with tempId and node payload, call batchNodeMutations API, on success call store.confirmBatchCreate (or reconcileBatch), on failure call store.rollbackBatchCreate; depends on T016
- [x] T018 [US2] Wire batch create to duplicate-selected action in frontend/src/components/canvas/Canvas.tsx — add keyboard handler for Ctrl/Cmd+D when nodes are selected: for each selected node, generate a tempId and create a duplicate payload with offset position (+20, +20); call batchCreateNodes with all duplicates; this provides a practical multi-create trigger for MVP

**Checkpoint**: Select 2 nodes, press Ctrl+D. Both duplicates appear at offset positions. One network request. Reload — duplicates persist with real UUIDs.

---

## Phase 5: User Story 3 — Batch Delete Multiple Nodes (Priority: P2)

**Goal**: User selects multiple nodes and deletes them all at once. All nodes and their connected edges are removed atomically.

**Independent Test**: Select 2+ nodes (some with edges), press Delete. All selected nodes and connected edges disappear. Reload — all deleted. Attempt with a locked node in selection — batch fails, nothing deleted.

### Implementation for User Story 3

- [x] T019 [US3] Extend frontend/src/store/board.store.ts — implement `batchDeleteOptimistic(nodeIds: string[]): { nodeSnapshots: Record<string, BoardNode>, edgeSnapshots: Record<string, BoardEdge> }` that snapshots all targeted nodes and all edges connected to any of them, removes nodes from nodesById/nodeOrder and connected edges from edgesById/edgeOrder, sets batchMutation status='pending', returns snapshots for rollback; implement `rollbackBatchDelete(nodeSnapshots, edgeSnapshots): void` that restores all nodes and edges from snapshots
- [x] T020 [US3] Extend frontend/src/hooks/useBatchNodeMutations.ts — add `batchDeleteNodes(nodeIds: string[])`: check none are locked (skip locked with warning), call store.batchDeleteOptimistic, build operations array of type:'delete' items, call batchNodeMutations API, on success call store.reconcileBatch (finalize removals, update revision), on failure call store.rollbackBatchDelete with snapshots; depends on T019
- [x] T021 [US3] Wire batch delete to multi-select + Delete key in frontend/src/components/canvas/Canvas.tsx — extend existing Delete/Backspace keyboard handler: when selectedNodeIds.length > 1, call batchDeleteNodes(selectedNodeIds) instead of single deleteNodeWithUndo; when selectedNodeIds.length === 1, continue using existing single-node delete with undo toast; guard against archived boards

**Checkpoint**: Select 3 nodes with edges, press Delete. All 3 nodes + connected edges disappear in one request. Board revision bumps once. On failure (e.g., locked node in batch), all nodes reappear.

---

## Phase 6: User Story 4 — Mixed Batch Operations (Priority: P2)

**Goal**: The batch endpoint correctly handles create+update+delete operations in one request with ordered execution and temp-ID cross-references. This story is primarily about backend correctness (already implemented in Phase 2) verified through targeted integration tests.

**Independent Test**: Submit a batch via API that creates a node (tmp-1), updates tmp-1's position, and deletes an existing node. Verify all three outcomes in the response and in subsequent board state hydration.

### Implementation for User Story 4

- [x] T022 [US4] Verify mixed batch correctness in backend/tests/integration/batch.integration.test.ts — add dedicated test cases: (1) create node B with tmp-1 → update tmp-1 position → delete existing node A: verify B created at updated position, A deleted with cascade edges, single revision bump, single batchId across all operations; (2) create with tmp-1 → create with tmp-2 → update tmp-1 referencing tmp-2: verify both created and update applied; (3) create with tmp-1 → delete tmp-1: verify node created then deleted in same batch; (4) update referencing undefined temp ID → verify entire batch fails; (5) delete node A → update node A → verify entire batch fails (cannot update deleted entity)

**Checkpoint**: All mixed-batch integration test scenarios pass. Temp-ID cross-references resolve correctly. Invalid sequences fail the entire batch.

---

## Phase 7: User Story 5 — Frontend Grouped-Action Feedback (Priority: P2)

**Goal**: User always sees clear pending state during batch operations and clean rollback on failure. No ambiguous intermediate board state.

**Independent Test**: Trigger a batch move — all nodes show pending indicator. On success, indicators clear and positions update. Simulate failure — all nodes revert and error is displayed.

### Implementation for User Story 5

- [x] T023 [US5] Add batch pending indicators to frontend/src/components/canvas/nodes/NodeWrapper.tsx — read batchMutation.status and batchMutation.affectedNodeIds from store; when status='pending' and node.id is in affectedNodeIds, apply pending visual treatment (subtle pulse animation or reduced opacity, thin blue border); when status='error', apply error treatment (red outline) on affected nodes; clear treatment when status='idle'
- [x] T024 [US5] Add batch error notification to frontend/src/components/canvas/Canvas.tsx — when batchMutation.status transitions to 'error', display an error message (inline banner or toast) with batchMutation.error text and a dismiss button; on dismiss, reset batchMutation to idle; ensure error is visible without blocking canvas interaction
- [x] T025 [US5] Add auto-clear for batch success indicators — extend reconcileBatch in board.store.ts to reset batchMutation.status to 'idle' with a short delay (or immediately) so the pending→confirmed transition is smooth; ensure that rapid successive batch actions (e.g., drag-release-drag-release) do not produce stale indicators

**Checkpoint**: Batch move shows pending indicators on all affected nodes during flight. Success clears indicators. Failure shows error + nodes revert. No ambiguous intermediate states.

---

## Phase 8: Testing & Polish

**Purpose**: Comprehensive test coverage, cross-cutting validation, constitution compliance.

- [x] T026 [P] Write unit tests for batch validation rules in backend/tests/unit/batch-rules.unit.test.ts — test: validateBatchSize accepts 1–200, rejects 0, rejects 201; validateNoDuplicateTempIds accepts unique IDs, rejects duplicates, handles batches with no create operations
- [x] T027 [P] Write unit tests for temp-ID registry in backend/tests/unit/temp-id-map.unit.test.ts — test: register stores mapping, resolve returns realId for registered tempId, resolve returns input unchanged for non-temp ID, has returns true/false correctly, register throws on duplicate tempId, resolve with unregistered temp-looking ID returns it unchanged
- [x] T028 Write integration tests for batch endpoint in backend/tests/integration/batch.integration.test.ts — against real DB; test: (1) batch of 3 creates with temp IDs returns 3 full node objects with real UUIDs and tempId fields, revision bumps once, 3 create_node operations with shared batchId; (2) batch of 5 updates returns 5 full node objects, revision bumps once; (3) batch delete of 2 nodes returns deleted array with node+edge type entries for cascade, revision bumps once; (4) batch with invalid nodeId reference fails entirely, no state change, no revision bump; (5) batch with locked node fails entirely; (6) batch on archived board returns appropriate error; (7) empty operations array returns 422; (8) 201 operations returns 422; (9) exactly 200 operations succeeds; (10) duplicate tempIds returns 422; (11) batch delete targeting already-deleted node fails entire batch; (12) update referencing temp ID from earlier create resolves correctly; (13) idempotent retry with same key returns cached response
- [x] T029 Write HTTP contract tests in backend/tests/contract/batch.contract.test.ts — test: POST /api/boards/{boardId}/nodes/batch returns 200 with batchId + boardRevision + created/updated/deleted; verify created entries include tempId field; verify deleted entries have type field; POST with empty operations returns 422; POST on non-existent board returns 404; POST on archived board returns 409; POST with locked node target returns 409; verify Idempotency-Key header support; verify Content-Type application/json accepted
- [x] T030 [P] Write frontend unit tests in frontend/tests/unit/batch-mutations.unit.test.ts — test: batchMoveOptimistic snapshots nodes and applies new positions; reconcileBatch replaces nodes with server objects and updates revision; rollbackBatch restores snapshots; batchDeleteOptimistic removes nodes and connected edges; rollbackBatchDelete restores nodes and edges; batchCreateOptimistic adds to pendingNodes
- [x] T031 Run quickstart.md verification checklist — execute all curl commands from specs/007-node-batch-mutations/quickstart.md: batch create with temp IDs, batch update referencing temp ID, mixed create+update+delete
- [x] T032 Constitution compliance review — confirm: batch uses withBoardMutation for atomicity (Principle V), revision bumps exactly once (Principle II), operation log entries with shared batchId (Principle III), in-tx helpers reused from single-node service (Principle IV/VIII), no hardcoded limits (Principle X), structured logging emits batchId/opCount/opTypes (Principle X), error envelope consistency (Principle VI), frontend reconciles from server diff not local inference (Principle I)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (batch limits) — **BLOCKS all frontend batch stories**
- **US1 (Phase 3)**: Depends on Phase 2 (batch endpoint) — first frontend batch story
- **US2 (Phase 4)**: Depends on Phase 3 (shared batch store infrastructure + API function)
- **US3 (Phase 5)**: Depends on Phase 3 (shared batch store infrastructure); independent of US2
- **US4 (Phase 6)**: Depends on Phase 2 only (backend correctness); can run in parallel with US1–US3
- **US5 (Phase 7)**: Depends on Phases 3–5 (pending/rollback UX applies to all batch actions)
- **Testing & Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 — establishes shared batch frontend infrastructure (API function, store actions, hook)
- **US2 (P1)**: Depends on US1 (extends the same store and hook files with create-specific actions)
- **US3 (P2)**: Depends on US1 (extends the same store and hook files with delete-specific actions); independent of US2
- **US4 (P2)**: Depends on Phase 2 only (backend integration tests); can run alongside any frontend story
- **US5 (P2)**: Depends on US1–US3 (visual indicators apply to all batch mutation types)

### Within Each User Story

- Store type definitions before store actions
- Store actions before hooks that use them
- Hooks before components that wire them
- Component rendering before interaction wiring

### Parallel Opportunities

Within Phase 2 (after Phase 1):
- T002 (refactor nodes.service), T003 (batch-rules), T004 (temp-id-map), T005 (batch.schemas) can all run in parallel (different files)
- T006 (batch.service) depends on T002–T005
- T007 (controller) depends on T005, T006
- T008 (router) depends on T007
- T009 (error-handler) depends on T003

Across user stories after Phase 3:
- US2 (Phase 4) and US3 (Phase 5) can partially overlap — they extend the same files but add different, non-conflicting actions
- US4 (Phase 6) can run fully in parallel with any frontend story (backend-only tests)

Within Phase 8:
- T026 (batch-rules tests), T027 (temp-id-map tests), T030 (frontend tests) can all run in parallel
- T028 (integration) and T029 (contract) are sequential
- T031 (quickstart) runs after all tests pass

---

## Parallel Example: Phase 2 Foundational

```text
# After Phase 1 completes, launch in parallel:
Task T002: "Refactor nodes.service.ts — extract in-transaction helpers"
Task T003: "Create batch validation rules in batch-rules.ts"
Task T004: "Create temp-ID registry in temp-id-map.ts"
Task T005: "Create Zod batch schemas in batch.schemas.ts"

# After T002–T005 complete:
Task T006: "Create batch.service.ts"

# After T006 completes:
Task T007: "Add batch handler to nodes.controller.ts"
Task T009: "Update error-handler.ts for BatchValidationError"

# After T007 completes:
Task T008: "Register batch route in router.ts"
```

## Parallel Example: Phase 8 Testing

```text
# Launch unit tests in parallel:
Task T026: "Write batch-rules unit tests"
Task T027: "Write temp-id-map unit tests"
Task T030: "Write frontend batch-mutations unit tests"

# After unit tests:
Task T028: "Write batch integration tests"

# After integration:
Task T029: "Write batch contract tests"
Task T031: "Run quickstart verification"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (batch limits)
2. Complete Phase 2: Foundational backend (batch endpoint)
3. Complete Phase 3: US1 (multi-node rearrange)
4. **STOP and VALIDATE**: User can select multiple nodes, drag them as a group, and have all positions commit atomically. This is the minimum useful batch increment.

### Incremental Delivery

1. Setup + Foundational → Backend batch endpoint fully functional (curl-testable)
2. Add US1 (batch move) → **MVP: grouped canvas moves work** 🎯
3. Add US2 (batch create) → Multi-create/duplicate flows work
4. Add US3 (batch delete) → Multi-delete works
5. Add US4 (mixed batch tests) → Backend correctness verified for future agent-apply
6. Add US5 (grouped-action feedback) → Pending/rollback UX polished
7. Testing & Polish → Production-ready slice

### Single Developer Strategy

Recommended sequential order:

1. Phase 1 → Phase 2 (backend, ~40% of effort)
2. Phase 3 (batch move MVP, ~20% of effort — **MVP checkpoint**)
3. Phase 4 → Phase 5 (batch create + delete, ~15% of effort)
4. Phase 6 → Phase 7 (mixed tests + UX polish, ~10% of effort)
5. Phase 8 (tests + compliance, ~15% of effort)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- The store file (board.store.ts) is modified across US1, US2, US3, US5 — these modifications are sequential and additive. Each story adds new actions/state.
- The useBatchNodeMutations.ts hook is extended across US1, US2, US3 — each story adds new exported functions.
- Backend work is consolidated in Phase 2 because the single batch endpoint handles all operation types. The endpoint's internal logic (ordered execution, temp-ID resolution, cascade, mixed operations) is all part of one service function.
- US4 (Mixed Batch) has no separate frontend implementation — the batch API already accepts mixed operation types. US4's value is backend correctness verification through integration tests.
- The refactoring in T002 (extract in-tx helpers) is the most delicate task — it must not break existing single-node endpoints. Run existing nodes.integration.test.ts after refactoring to confirm.
- Commit after each completed phase or user story.
- Stop at any checkpoint to validate the story independently.
