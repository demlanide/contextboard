# Tasks: Edge CRUD

**Input**: Design documents from `/specs/006-edge-crud/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/edge-endpoints.md, quickstart.md

**Tests**: Included in the final phase. The plan structures three test files (unit: edge-rules; integration: edges; contract: edges). Tests are generated as a dedicated phase after all user stories are complete.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Backend endpoints for all three operations (create, update, delete) share foundational infrastructure (validation rules, repo extensions, service, controller) and are grouped together in Phase 2 as blocking prerequisites. Frontend stories are ordered US1 → US2 → US3 → US4 → US5 because edge rendering and connection creation (US1) produce edges that all other stories operate on, visual feedback (US2) enhances the connection flow, and delete/update/failure handling build on that foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/` at repository root (per plan.md project structure)

---

## Phase 1: Setup

**Purpose**: Configuration updates that must be in place before endpoint implementation.

- [X] T001 Add edge-specific limits to backend/src/config/limits.ts — add `edge` section with `label: { max: 1_000 }` per data-model.md §Validation Rules and contracts/edge-endpoints.md

---

## Phase 2: Foundational (Backend — All Three Endpoints)

**Purpose**: Complete backend infrastructure for edge create, update, and delete. All three endpoints share validation rules, repo extensions, and the service layer. These MUST be complete before any frontend edge story can be end-to-end tested.

**⚠️ CRITICAL**: No frontend mutation story (US1–US5) can be end-to-end verified until this phase is complete.

- [X] T002 [P] Create edge validation rules in backend/src/domain/validation/edge-rules.ts — export `EdgeError` (extends Error with code property, following BoardError/NodeError pattern), `EdgeNotFoundError` (code: EDGE_NOT_FOUND), `InvalidEdgeReferenceError` (code: INVALID_EDGE_REFERENCE); export `assertEdgeExists(edge)` that throws EdgeNotFoundError if null; export `assertEdgeActive(edge)` that throws EdgeNotFoundError if deleted_at is set; export `assertEndpointsExist(sourceNode, targetNode)` that throws InvalidEdgeReferenceError if either is null; export `assertEndpointsActive(sourceNode, targetNode)` that throws InvalidEdgeReferenceError if either has deleted_at set; export `assertEndpointsSameBoard(boardId, sourceNode, targetNode)` that throws InvalidEdgeReferenceError if either node's boardId does not match the route boardId; export `assertNotSelfLoop(sourceNodeId, targetNodeId)` that throws EdgeError with VALIDATION_ERROR code if sourceNodeId === targetNodeId; per data-model.md §Validation Rules
- [X] T003 [P] Create Zod request/response schemas in backend/src/schemas/edge.schemas.ts — import EdgeSchema from board-state.schemas; export `CreateEdgeRequestSchema` (sourceNodeId required uuid, targetNodeId required uuid, label string nullable max 1000 optional, style object optional default {}, metadata object optional default {}); export `UpdateEdgeRequestSchema` (label string nullable max 1000 optional, style object optional, metadata object optional — NO sourceNodeId/targetNodeId per clarification: endpoints immutable); export `EdgeResponseDataSchema` wrapping EdgeSchema with boardRevision int; export `DeleteEdgeResponseDataSchema` with success boolean, deletedEdgeId uuid, boardRevision int; per contracts/edge-endpoints.md and research.md R3
- [X] T004 [P] Extend backend/src/repos/edges.repo.ts — add `findActiveById(client, edgeId): Promise<Edge | null>` that selects where id=$1 AND deleted_at IS NULL and returns mapEdgeRow or null; add `insertEdge(client, params): Promise<Edge>` that INSERTs id (generated uuid), board_id, source_node_id, target_node_id, label, style, metadata and RETURNS * mapped via mapEdgeRow; add `updateEdge(client, edgeId, fields): Promise<Edge>` that builds a dynamic UPDATE SET for provided fields (label, style, metadata), sets updated_at=now(), returns mapped row; add `softDeleteEdge(client, edgeId): Promise<void>` that sets deleted_at=now() and updated_at=now() WHERE id=$1 AND deleted_at IS NULL; follow the same PoolClient-param pattern from nodes.repo.ts
- [X] T005 Create backend/src/services/edges.service.ts — import withBoardMutation from db/tx, buildOperation from operation-factory, edge rules from edge-rules, board rules from board-rules, applyMergePatch from merge-patch, edges and nodes repos; implement `createEdge(boardId, data)`: use withBoardMutation, assertBoardEditable, look up source and target nodes via nodes.repo.findActiveById, assertEndpointsExist, assertEndpointsActive, assertEndpointsSameBoard(boardId, sourceNode, targetNode), assertNotSelfLoop(data.sourceNodeId, data.targetNodeId), insertEdge, buildOperation with create_edge/target_type='edge', return {edge, boardRevision}; implement `updateEdge(edgeId, patch)`: use withBoardMutation (look up edge to get boardId), assertEdgeExists, assertEdgeActive, assertBoardEditable, apply merge-patch for style/metadata, handle label directly, updateEdge repo, buildOperation with update_edge, return {edge, boardRevision}; implement `deleteEdge(edgeId)`: use withBoardMutation, assertEdgeExists, assertEdgeActive, assertBoardEditable, softDeleteEdge, buildOperation with delete_edge, return {deletedEdgeId, boardRevision}; per quickstart.md §Backend Key Files
- [X] T006 Create backend/src/http/controllers/edges.controller.ts — import Zod schemas from edge.schemas, edge service functions, common response helpers, uuidSchema from common.schemas; implement `handleCreateEdge(req, res, next)` parsing boardId from params (validate uuid), body from CreateEdgeRequestSchema, calling createEdge service, returning 201 with successResponse({edge, boardRevision}); implement `handleUpdateEdge(req, res, next)` parsing edgeId from params (validate uuid), body from UpdateEdgeRequestSchema, calling updateEdge, returning 200; implement `handleDeleteEdge(req, res, next)` parsing edgeId from params (validate uuid), calling deleteEdge, returning 200 with successResponse({success: true, deletedEdgeId, boardRevision}); follow error handling pattern from nodes.controller.ts (let errors propagate to next)
- [X] T007 Register edge routes in backend/src/http/router.ts — import handleCreateEdge, handleUpdateEdge, handleDeleteEdge from edges.controller; add: POST /boards/:boardId/edges with idempotencyMiddleware('create_edge') and handleCreateEdge; PATCH /edges/:edgeId with requireMergePatch, idempotencyMiddleware('update_edge'), and handleUpdateEdge; DELETE /edges/:edgeId with handleDeleteEdge; place after the existing node routes
- [X] T008 Update backend/src/http/middleware/error-handler.ts — add handling for EdgeNotFoundError (return 404 with EDGE_NOT_FOUND code), InvalidEdgeReferenceError (return 422 with INVALID_EDGE_REFERENCE code), and generic EdgeError (return 422); import error classes from edge-rules.ts; place alongside the existing NodeError handling

**Checkpoint**: All three backend endpoints work. Verify with curl commands from quickstart.md — create edge between two nodes, update label, delete edge. Board revision increments. Operations logged. Validation rejects self-loop, cross-board, deleted-node targets.

---

## Phase 3: User Story 1 — Connect Two Nodes (Priority: P1) 🎯 MVP

**Goal**: User drags from a connection handle on one node to another node and releases. The edge is created, persisted, and rendered on the canvas as a visible line between the two nodes.

**Independent Test**: Create two nodes on a board (via curl or UI), drag from node A's connection handle to node B. A confirmed edge appears as a line between them. Reload the board — the edge persists.

### Implementation for User Story 1

- [X] T009 [P] [US1] Create frontend/src/api/edges.api.ts — export `createEdge(boardId, body)` calling POST /api/boards/{boardId}/edges with JSON body, returning {edge, boardRevision}; export `updateEdge(edgeId, patch)` calling PATCH /api/edges/{edgeId} with Content-Type application/merge-patch+json, returning {edge, boardRevision}; export `deleteEdge(edgeId)` calling DELETE /api/edges/{edgeId}, returning {success, deletedEdgeId, boardRevision}; use apiRequest from client.ts; define CreateEdgeBody, UpdateEdgeBody, EdgeResponseData, DeleteEdgeResponseData interfaces
- [X] T010 [US1] Extend frontend/src/store/types.ts — add `ConnectionDragState` interface with `sourceNodeId: string, cursorX: number, cursorY: number, hoveredTargetId: string | null, isValid: boolean`; add `selectedEdgeId: string | null` to UIState; add edge mutation actions to BoardStore: `addEdgeOptimistic(tempId, edge)`, `confirmEdge(tempId, serverEdge, boardRevision)`, `rollbackEdge(tempId)`, `removeEdgeOptimistic(edgeId)`, `confirmEdgeDelete(edgeId, boardRevision)`, `undoEdgeDelete(snapshot)`, `updateEdgeOptimistic(edgeId, patch)`, `confirmEdgeUpdate(edgeId, serverEdge, boardRevision)`, `rollbackEdgeUpdate(edgeId, snapshot)`, `setSelectedEdgeId(id | null)`, `setConnectionDrag(state | null)`
- [X] T011 [US1] Extend frontend/src/store/board.store.ts — add initial state: selectedEdgeId=null, connectionDrag=null; implement `addEdgeOptimistic(tempId, edge)` that adds to edgesById with tempId as key and appends to edgeOrder; implement `confirmEdge(tempId, serverEdge, boardRevision)` that removes tempId entry, adds serverEdge to edgesById/edgeOrder, updates board.revision and sync.lastSyncedRevision; implement `rollbackEdge(tempId)` that removes tempId entry from edgesById/edgeOrder; implement `setSelectedEdgeId(id)` and `setConnectionDrag(state)` setters; update hydrate action to populate edgesById/edgeOrder from hydration response (if not already); update reset() to clear new edge state
- [X] T012 [P] [US1] Create frontend/src/components/canvas/edges/EdgeRenderer.tsx — accept edges: BoardEdge[] and nodesById: Record<string, BoardNode> props; render an SVG element (position: absolute, pointer-events: none for the SVG container, pointer-events: auto on edge lines) sized to the canvas viewport; for each edge, look up source and target node positions from nodesById, compute center points (node.x + node.width/2, node.y + node.height/2), render an SVG `<line>` or `<path>` from source center to target center; apply stroke color from edge.style or default gray; if edge.label exists, render a `<text>` element at the midpoint of the line; apply selectedEdgeId highlight (thicker stroke, accent color) when edge is selected
- [X] T013 [P] [US1] Create frontend/src/components/canvas/edges/ConnectionHandle.tsx — render a small circle (12×12px, absolute positioned) at the right edge of a node (or each side if preferred); on pointerdown, call a provided onConnectionStart(nodeId, event) callback; apply hover style (scale up, accent color) on mouse over; accept nodeId: string and onConnectionStart callback props; use Tailwind classes for styling
- [X] T014 [US1] Create frontend/src/hooks/useEdgeConnection.ts — manage connection drag state; export `useEdgeConnection()` hook returning `{ connectionDrag, startConnection, handlePointerMove, endConnection }`; `startConnection(nodeId, event)` sets connectionDrag in store with sourceNodeId and initial cursor position; `handlePointerMove(event)` updates cursorX/cursorY in connectionDrag state, determines hoveredTargetId by checking if cursor is over any node (hit test against nodesById positions/dimensions), sets isValid based on: target exists, target !== source (no self-loop), target is active; `endConnection(event)` checks if hoveredTargetId is valid — if yes, calls a provided onConnect(sourceNodeId, targetNodeId) callback and clears connectionDrag; if no valid target, clears connectionDrag silently
- [X] T015 [US1] Create frontend/src/hooks/useEdgeMutations.ts — export `useEdgeMutations()` hook; implement `createEdge(boardId, sourceNodeId, targetNodeId)`: generate tempId, build optimistic edge object with temp data, call store.addEdgeOptimistic(tempId, edge), call edges.api.createEdge, on success call store.confirmEdge(tempId, serverEdge, boardRevision), on failure call store.rollbackEdge(tempId); return { createEdge }
- [X] T016 [US1] Integrate edges into frontend/src/components/canvas/Canvas.tsx — read edgesById and edgeOrder from store; render EdgeRenderer component in the canvas content layer (before node layer so edges appear behind nodes); attach ConnectionHandle to each NodeWrapper (render ConnectionHandle as a child, passing nodeId and onConnectionStart from useEdgeConnection); attach useEdgeConnection handlePointerMove and endConnection to the canvas container's pointermove and pointerup events; when endConnection fires with a valid target, call useEdgeMutations.createEdge; on click on empty canvas, clear selectedEdgeId

**Checkpoint**: Drag from a connection handle on node A to node B. Edge is created and renders as a line. Reload — edge persists. Self-loop drag does nothing.

---

## Phase 4: User Story 2 — Visual Feedback During Connection (Priority: P2)

**Goal**: During a connection drag, a temporary preview edge follows the cursor from the source node. Valid target nodes are visually highlighted; invalid ones (self, deleted) are visually distinguished. Releasing on empty canvas cancels cleanly.

**Independent Test**: Start dragging from a connection handle. Observe: (a) dashed preview line from source to cursor, (b) hovering valid nodes shows highlight, (c) hovering the source node itself shows no valid indicator, (d) releasing on empty canvas leaves no artifacts.

### Implementation for User Story 2

- [X] T017 [P] [US2] Create frontend/src/components/canvas/edges/PreviewEdge.tsx — accept sourceX, sourceY, cursorX, cursorY, isValid props; render an SVG `<line>` from (sourceX, sourceY) to (cursorX, cursorY) with dashed stroke (strokeDasharray); use accent color when isValid is true, gray/red when false; render in the same SVG layer as EdgeRenderer
- [X] T018 [US2] Extend useEdgeConnection.ts with valid/invalid target classification — on each handlePointerMove, compute valid targets list from nodesById (exclude source node, exclude any node with hidden flag); when cursor hovers over a valid target, set connectionDrag.hoveredTargetId and isValid=true; when cursor hovers over the source node, set hoveredTargetId to source but isValid=false; when cursor hovers over no node, set hoveredTargetId=null, isValid=false; expose `getTargetValidity(nodeId): 'valid' | 'invalid' | 'self' | null` for rendering
- [X] T019 [US2] Add target feedback styles to NodeWrapper — when a connection drag is active (connectionDrag !== null in store), apply CSS classes to each node based on target validity: valid targets get a green/accent ring highlight (ring-2 ring-green-400); the source node gets a dimmed/blocked indicator (opacity-50, ring-red-300); other nodes remain neutral; clear all feedback styles when connectionDrag is null
- [X] T020 [US2] Integrate PreviewEdge into Canvas.tsx — when connectionDrag is active in store, render PreviewEdge in the SVG layer using source node center as origin and connectionDrag.cursorX/cursorY as endpoint; pass isValid from connectionDrag state; ensure preview disappears immediately when connectionDrag clears (on release or cancel)

**Checkpoint**: Start connection drag → see dashed preview line following cursor. Hover valid node → green highlight. Hover source node → dimmed/blocked. Release on empty canvas → preview vanishes, no edge created.

---

## Phase 5: User Story 3 — Delete an Edge (Priority: P2)

**Goal**: User clicks an edge to select it, then presses Delete. The edge disappears from the board and is excluded from subsequent board loads.

**Independent Test**: Create an edge, click it to select (highlight visible), press Delete. Edge disappears. Reload — edge is gone.

### Implementation for User Story 3

- [X] T021 [US3] Extend frontend/src/store/board.store.ts — implement `removeEdgeOptimistic(edgeId)` that snapshots the edge into a local undo record, removes from edgesById/edgeOrder; implement `confirmEdgeDelete(edgeId, boardRevision)` that finalizes removal and updates board.revision; implement `undoEdgeDelete(snapshot)` that restores edge from snapshot into edgesById/edgeOrder
- [X] T022 [US3] Extend frontend/src/hooks/useEdgeMutations.ts — add `deleteEdge(edgeId)` that: calls store.removeEdgeOptimistic(edgeId), calls edges.api.deleteEdge(edgeId), on success calls store.confirmEdgeDelete, on failure calls store.undoEdgeDelete with snapshot and shows error message
- [X] T023 [US3] Add edge selection and delete interaction — in EdgeRenderer.tsx, make edge lines clickable (pointer-events: stroke or wrap in a wider invisible hit area for easier clicking); on click, call store.setSelectedEdgeId(edge.id); render selected edge with thicker stroke and accent color; in Canvas.tsx or a keyboard handler, listen for Delete and Backspace key events when selectedEdgeId is set; call useEdgeMutations.deleteEdge(selectedEdgeId); clear selectedEdgeId after delete; guard against archived boards (skip delete if board.status !== 'active')

**Checkpoint**: Click an edge → selected highlight. Press Delete → edge disappears. Reload → edge is gone. Board revision incremented.

---

## Phase 6: User Story 4 — Update an Edge (Priority: P3)

**Goal**: User selects an edge and modifies its label or style. Changes are saved via partial update and reflected on the board immediately.

**Independent Test**: Create an edge, select it, edit its label (e.g., type "depends on"). Blur/confirm. Reload — updated label persists.

### Implementation for User Story 4

- [X] T024 [US4] Extend frontend/src/store/board.store.ts — implement `updateEdgeOptimistic(edgeId, patch)` that snapshots current edge, applies patch to edgesById entry locally (label, style, metadata); implement `confirmEdgeUpdate(edgeId, serverEdge, boardRevision)` that replaces edgesById entry with server edge, updates board.revision; implement `rollbackEdgeUpdate(edgeId, snapshot)` that restores edgesById entry from snapshot
- [X] T025 [US4] Extend frontend/src/hooks/useEdgeMutations.ts — add `updateEdge(edgeId, patch)` that: calls store.updateEdgeOptimistic to apply locally, calls edges.api.updateEdge(edgeId, patch) with merge-patch content type, on success calls store.confirmEdgeUpdate, on failure calls store.rollbackEdgeUpdate with snapshot and shows error
- [X] T026 [US4] Add edge label editing interaction — when an edge is selected (selectedEdgeId is set), render a small inline text input or popover near the edge midpoint for editing the label; on blur or Enter, call useEdgeMutations.updateEdge(edgeId, {label: newValue}); pre-populate with current edge.label; allow clearing label by submitting empty string (sends null); guard against archived boards; display updated label on the edge line via EdgeRenderer

**Checkpoint**: Select edge → edit label → blur → label updates visually and persists on reload. Style changes via updateEdge work the same way.

---

## Phase 7: User Story 5 — Graceful Failure Handling (Priority: P3)

**Goal**: When an edge creation or mutation fails, the system rolls back cleanly with no ghost edges. The user sees a clear error and can retry.

**Independent Test**: Simulate a failed edge creation (e.g., target node deleted between drag start and release). Verify: no phantom edge remains, error message shown, retry with valid target succeeds.

### Implementation for User Story 5

- [X] T027 [US5] Harden useEdgeMutations.ts createEdge failure path — on API failure in createEdge: ensure store.rollbackEdge(tempId) removes the optimistic edge completely (no ghost in edgesById or edgeOrder); show an error toast or inline error message with the server's error reason (parse error.code from response: INVALID_EDGE_REFERENCE, VALIDATION_ERROR, BOARD_NOT_FOUND); ensure connectionDrag state is cleared so the user can retry immediately
- [X] T028 [US5] Harden useEdgeConnection.ts cleanup — ensure that if createEdge is called and fails, the connectionDrag state is always cleared (no lingering preview edge); add a try/finally wrapper around the endConnection → createEdge flow to guarantee cleanup; verify that releasing on empty canvas never triggers an API call
- [X] T029 [US5] Add error display for failed edge operations — create a lightweight error toast or reuse existing shared/ErrorMessage.tsx for edge mutation failures; display for create, update, and delete failures; auto-dismiss after 5 seconds; ensure the error does not block subsequent interactions; verify that after a failure, the next valid connection attempt succeeds normally without interference

**Checkpoint**: Simulate edge creation failure → no ghost edge, error shown. Retry with valid target → succeeds. Delete/update failures also display errors and roll back cleanly.

---

## Phase 8: Testing & Polish

**Purpose**: Validate all acceptance scenarios, verify cross-cutting concerns, ensure no regressions.

- [X] T030 [P] Write unit tests for edge validation rules in backend/tests/unit/edge-rules.unit.test.ts — test: assertEdgeExists throws for null, passes for active edge; assertEdgeActive throws for edge with deleted_at set; assertEndpointsExist throws if either node is null; assertEndpointsActive throws if either node has deleted_at; assertEndpointsSameBoard throws if node boardId doesn't match route boardId; assertNotSelfLoop throws when sourceNodeId === targetNodeId, passes when different
- [X] T031 Write integration tests for edge CRUD in backend/tests/integration/edges.integration.test.ts — against real DB; test: (1) create edge between two active same-board nodes returns 201 with edge + boardRevision, (2) create edge bumps revision exactly once and writes create_edge operation, (3) create edge with self-loop rejected (422), (4) create edge with cross-board nodes rejected (422 INVALID_EDGE_REFERENCE), (5) create edge with deleted source/target rejected (422), (6) create edge with non-existent node rejected (422), (7) update edge label via merge-patch works, (8) update edge bumps revision and writes update_edge operation, (9) update edge with sourceNodeId/targetNodeId in body rejected (422), (10) delete edge sets deleted_at and writes delete_edge operation, (11) deleted edge excluded from board state hydration, (12) archived board rejects all edge mutations, (13) duplicate edges between same nodes both succeed
- [X] T032 Write HTTP contract tests for edge endpoints in backend/tests/contract/edges.contract.test.ts — test: POST /boards/{boardId}/edges returns 201 with edge + boardRevision; POST with self-loop returns 422; POST with non-existent node returns 422; POST on archived board returns 422; POST on non-existent board returns 404; PATCH /edges/{edgeId} returns 200 with updated edge + boardRevision; PATCH with wrong content-type returns 415; PATCH non-existent edge returns 404; DELETE /edges/{edgeId} returns 200 with deletedEdgeId + boardRevision; DELETE non-existent returns 404
- [X] T033 Run quickstart.md verification checklist — execute all curl verification steps from specs/006-edge-crud/quickstart.md: create board, create two nodes, create edge, update edge label, delete edge, hydrate to confirm edge gone
- [X] T034 Code review: verify constitution compliance — confirm: all mutations use withBoardMutation (Principle III/V), revision bumps exactly once per mutation (Principle II), operation log entries for every durable edge mutation (Principle III), no hardcoded limits (Principle X), merge-patch content-type enforced on PATCH (Principle VI), structured logging on mutations (Principle X), error envelope consistency (Principle VI), frontend reconciles from server response (Principle I), server validation is authoritative even with client-side feedback (FR-016)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (limits config) — **BLOCKS all frontend edge stories (US1–US5)**
- **US1 (Phase 3)**: Depends on Phase 2 (backend create endpoint) — also requires existing node rendering from 005
- **US2 (Phase 4)**: Depends on Phase 3 (connection handles and basic drag flow to enhance)
- **US3 (Phase 5)**: Depends on Phase 3 (needs edges to exist for deleting); can run in parallel with US2 (different components)
- **US4 (Phase 6)**: Depends on Phase 3 (needs edges to exist for updating); can run in parallel with US2/US3
- **US5 (Phase 7)**: Depends on Phases 3–4 (failure handling builds on the connection + mutation flows)
- **Testing & Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 backend — independent of other frontend stories
- **US2 (P2)**: Depends on US1 (enhances the drag interaction from US1)
- **US3 (P2)**: Depends on US1 (needs created edges to delete); independent of US2
- **US4 (P3)**: Depends on US1 (needs created edges to update); independent of US2/US3
- **US5 (P3)**: Depends on US1+US2 (failure handling for the connection flow)

### Within Each User Story

- Store type definitions before store actions
- Store actions before hooks that use them
- Hooks before components that wire them
- Component rendering before interaction wiring

### Parallel Opportunities

Within Phase 2 (after Phase 1):
- T002 (edge-rules), T003 (edge schemas), T004 (edges.repo) can all run in parallel (different files)
- T005 (service) depends on T002–T004
- T006 (controller) depends on T003, T005
- T007 (router) depends on T006
- T008 (error-handler) depends on T002

Within Phase 3 (US1, after Phase 2):
- T009 (edges.api), T012 (EdgeRenderer), T013 (ConnectionHandle) can run in parallel (different files)
- T010 (types) → T011 (store) → T014 (useEdgeConnection) → T015 (useEdgeMutations) → T016 (Canvas integration) sequential

Across user stories after Phase 3:
- US2 (Phase 4), US3 (Phase 5), US4 (Phase 6) can partially overlap — US3 and US4 touch different interaction flows; main constraint is that board.store.ts and useEdgeMutations.ts are modified sequentially across stories.

Within Phase 8:
- T030 (edge-rules tests) can run independently
- T031 (integration) after T030 for confidence
- T032 (contract) can run in parallel with T031
- T033 (quickstart verification) after all tests pass

---

## Parallel Example: Phase 2 Foundational

```text
# After Phase 1 completes, launch in parallel:
Task T002: "Create edge validation rules in backend/src/domain/validation/edge-rules.ts"
Task T003: "Create Zod schemas in backend/src/schemas/edge.schemas.ts"
Task T004: "Extend edges.repo.ts with findActiveById/insertEdge/updateEdge/softDeleteEdge"

# After T002–T004 complete:
Task T005: "Create edges.service.ts"

# After T005 completes:
Task T006: "Create edges.controller.ts"
Task T008: "Update error-handler.ts for EdgeError types"

# After T006 completes:
Task T007: "Register edge routes in router.ts"
```

## Parallel Example: Phase 3 US1 Connection

```text
# After Phase 2 completes, launch in parallel:
Task T009: "Create frontend/src/api/edges.api.ts"
Task T012: "Create EdgeRenderer.tsx"
Task T013: "Create ConnectionHandle.tsx"

# Sequential store + hooks chain:
Task T010: "Extend store/types.ts"
Task T011: "Extend board.store.ts"
Task T014: "Create useEdgeConnection.ts"
Task T015: "Create useEdgeMutations.ts"

# After all pieces ready:
Task T016: "Integrate edges into Canvas.tsx"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (config limits)
2. Complete Phase 2: Foundational backend (all 3 endpoints)
3. Complete Phase 3: US1 (connection interaction + edge rendering)
4. **STOP and VALIDATE**: User can drag-to-connect two nodes and see the edge persist. This is the minimum useful increment — relationships on the board.

### Incremental Delivery

1. Setup + Foundational → Backend fully functional (curl-testable)
2. Add US1 (connect + render) → **MVP: boards have relationships** 🎯
3. Add US2 (visual feedback) → Connection interaction feels polished
4. Add US3 (delete) → Users can clean up edges
5. Add US4 (update) → Users can label and style edges
6. Add US5 (failure handling) → Robust error recovery
7. Testing & Polish → Production-ready slice

### Single Developer Strategy

Recommended sequential order:

1. Phase 1 → Phase 2 (backend, ~30% of effort)
2. Phase 3 (US1 connect + render, ~25% of effort — **MVP checkpoint**)
3. Phase 4 → Phase 5 → Phase 6 → Phase 7 (remaining interactions, ~30% of effort)
4. Phase 8 (tests + polish, ~15% of effort)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- The store file (board.store.ts) is modified across multiple stories — these modifications are sequential and additive. Each story adds new actions/state without changing existing ones.
- The useEdgeMutations.ts hook is extended across US1, US3, US4, US5 — each story adds new exported functions or hardens existing ones.
- The Canvas.tsx component is modified across US1, US2, US3 — each story adds rendering or interaction layers.
- Backend work is consolidated in Phase 2 because all three endpoints share foundational infrastructure. Splitting create/update/delete into separate phases would create artificial boundaries in the same service file.
- No new migrations needed — `board_edges` table already exists from 006_create_board_edges.sql.
- Edge positions are derived from node positions at render time, not stored on the edge entity.
- Commit after each completed phase or user story.
- Stop at any checkpoint to validate the story independently.
