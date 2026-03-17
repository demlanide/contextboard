# Tasks: Node CRUD

**Input**: Design documents from `/specs/005-node-crud/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/node-endpoints.md, quickstart.md

**Tests**: Included in the final phase. The plan structures four test files (unit: node-rules, merge-patch; integration: nodes; contract: nodes). Tests are generated as a dedicated phase after all user stories are complete.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Backend endpoints for all three operations (create, update, delete) share foundational infrastructure (validation rules, merge-patch, repo extensions, service, controller) and are grouped together in Phase 2 as blocking prerequisites. Frontend stories are ordered US5 → US1 → US2 → US3 → US4 → US6 because canvas rendering (US5) is the visual foundation all interactions depend on, and create (US1) produces nodes that edit/move/delete operate on.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/` at repository root (per plan.md project structure)

---

## Phase 1: Setup

**Purpose**: Configuration and contract updates that must be in place before endpoint implementation.

- [X] T001 Update documentation/openapi.yaml — add `boardRevision` (integer) to `NodeResponse.data` alongside `node`; add `deletedEdgeIds` (array of UUID strings) and `boardRevision` (integer) to `DeleteNodeResponse.data` alongside `success` and `deletedNodeId`; per contracts/node-endpoints.md §OpenAPI Spec Updates Required
- [X] T002 [P] Add node-specific limits to backend/src/config/limits.ts — add `node` section with `text: { max: 20_000 }`, `title: { max: 500 }`, `shapeText: { max: 5_000 }`, `width: { min: 0, max: 10_000 }`, `height: { min: 0, max: 10_000 }` per data-model.md §Validation Rules

---

## Phase 2: Foundational (Backend — All Three Endpoints)

**Purpose**: Complete backend infrastructure for node create, update, and delete. All three endpoints share validation rules, merge-patch, repo extensions, and the service layer. These MUST be complete before any frontend mutation story can be end-to-end tested.

**⚠️ CRITICAL**: No frontend mutation story (US1–US4) can be end-to-end verified until this phase is complete. US5 (read-only rendering) can start after Phase 1.

- [X] T003 [P] Create node validation rules in backend/src/domain/validation/node-rules.ts — export `NodeError` (extends Error with code property, like BoardError), `NodeNotFoundError`, `NodeLockedError`; export `assertNodeExists(node)` (throws NodeNotFoundError if null or deleted_at set); export `assertNodeNotLocked(node)` (throws NodeLockedError if locked=true); export `validateNodeContent(type, content)` that dispatches by node type: sticky requires `content.text` string 1–20,000 chars; text requires `content.text` string 1–20,000 chars, optional `content.title` ≤ 500 chars; shape requires `content.shapeType` ∈ {rectangle, ellipse, diamond}, optional `content.text` ≤ 5,000 chars; image requires `content.assetId` as valid UUID string; use limits from config/limits.ts; per data-model.md §Content Shapes and §Validation Rules
- [X] T004 [P] Create merge-patch utility in backend/src/domain/patch/merge-patch.ts — export `applyMergePatch(target, patch)` that implements RFC 7396: for each key in patch, if value is null → delete key from result; if value is object and target[key] is object → recurse; otherwise → overwrite; return new object (do not mutate inputs); per research.md R-001
- [X] T005 [P] Create Zod request schemas in backend/src/schemas/node.schemas.ts — export `CreateNodeRequestSchema` (type enum, x number, y number, width positive ≤ 10000, height positive ≤ 10000, content object, optional parentId uuid|null, rotation default 0, zIndex int default 0, style object default {}, metadata object default {}); export `UpdateNodeRequestSchema` (all fields optional: x, y, width positive ≤ 10000, height positive ≤ 10000, rotation, zIndex int, content object, style object, metadata object, parentId uuid|null, locked boolean, hidden boolean); export `NodeResponseSchema` wrapping existing NodeSchema with boardRevision int; export `DeleteNodeResponseSchema` with success boolean, deletedNodeId uuid, deletedEdgeIds array of uuid, boardRevision int; per contracts/node-endpoints.md
- [X] T006 [P] Extend backend/src/repos/nodes.repo.ts — add `findActiveById(client, nodeId): Promise<Node | null>` that selects where id=$1 AND deleted_at IS NULL; add `insertNode(client, params): Promise<Node>` that inserts all columns and returns the mapped row; add `updateNode(client, nodeId, fields): Promise<Node>` that builds a dynamic UPDATE SET for provided fields, sets updated_at=now(), returns mapped row; add `softDeleteNode(client, nodeId): Promise<void>` that sets deleted_at=now() and updated_at=now() where id=$1 AND deleted_at IS NULL
- [X] T007 [P] Extend backend/src/repos/edges.repo.ts — add `softDeleteByNodeId(client, nodeId): Promise<string[]>` that updates board_edges SET deleted_at=now(), updated_at=now() WHERE (source_node_id=$1 OR target_node_id=$1) AND deleted_at IS NULL RETURNING id; return array of deleted edge IDs for operation logging
- [X] T008 Create backend/src/services/nodes.service.ts — import withBoardMutation from db/tx, buildOperation from operation-factory, node validation from node-rules, applyMergePatch from merge-patch, node/edge repos; implement `createNode(boardId, data)`: use withBoardMutation, assertBoardEditable, validateNodeContent, insertNode, buildOperation with create_node, return {node, boardRevision}; implement `updateNode(nodeId, patch)`: use withBoardMutation (look up node to get boardId), assertNodeExists, assertNodeNotLocked, apply merge-patch for content/style/metadata, validateNodeContent on merged result, updateNode repo, buildOperation with update_node, return {node, boardRevision}; implement `deleteNode(nodeId)`: use withBoardMutation, assertNodeExists, assertNodeNotLocked, softDeleteNode, softDeleteByNodeId for cascade edges, buildOperation for delete_node + each cascaded delete_edge, return {deletedNodeId, deletedEdgeIds, boardRevision}; per quickstart.md §Key Patterns
- [X] T009 Create backend/src/http/controllers/nodes.controller.ts — import Zod schemas, node service, common response helpers, uuidSchema; implement `handleCreateNode(req, res, next)` parsing boardId from params and body from CreateNodeRequestSchema, calling createNode service, returning 201 with successResponse({node, boardRevision}); implement `handleUpdateNode(req, res, next)` parsing nodeId from params and body from UpdateNodeRequestSchema, calling updateNode, returning 200; implement `handleDeleteNode(req, res, next)` parsing nodeId, calling deleteNode, returning 200 with successResponse({success: true, deletedNodeId, deletedEdgeIds, boardRevision}); follow error handling pattern from boards.controller.ts (let errors propagate to next)
- [X] T010 Register node routes in backend/src/http/router.ts — add: POST /boards/:boardId/nodes with idempotencyMiddleware('create_node') and handleCreateNode; PATCH /nodes/:nodeId with requireMergePatch, idempotencyMiddleware('update_node'), and handleUpdateNode; DELETE /nodes/:nodeId with handleDeleteNode; import handlers from nodes.controller
- [X] T011 Update backend/src/http/middleware/error-handler.ts — add handling for NodeNotFoundError (return 404), NodeLockedError (return 409 with LOCKED_NODE code), and generic NodeError (return 422); import error classes from node-rules.ts; place before the generic BoardError catch

**Checkpoint**: All three backend endpoints work. Verify with curl commands from quickstart.md — create sticky/text/shape nodes, update position/content, delete with cascade. Board revision increments. Operations logged.

---

## Phase 3: User Story 5 — See Confirmed Nodes on the Canvas (Priority: P1) 🎯 MVP Foundation

**Goal**: When a user opens a board, all confirmed nodes render on the canvas at their correct positions, sizes, and visual styles. Each node type is visually distinguishable. Hidden nodes are excluded.

**Independent Test**: Seed a board with nodes via curl (POST /boards/{boardId}/nodes for each type), open the board in the browser, and confirm each node renders at the correct position with appropriate visual treatment.

### Implementation for User Story 5

- [X] T012 [P] [US5] Create frontend/src/components/canvas/nodes/StickyNode.tsx — render a rectangular card with yellow-ish background (or from style.backgroundColor), display content.text as body text, apply style.fontSize/textColor if present; accept node: BoardNode prop
- [X] T013 [P] [US5] Create frontend/src/components/canvas/nodes/TextNode.tsx — render a text block with optional title (content.title, rendered as bold/larger heading) and body text (content.text); apply style properties; accept node: BoardNode prop
- [X] T014 [P] [US5] Create frontend/src/components/canvas/nodes/ShapeNode.tsx — render rectangle (rounded div), ellipse (border-radius 50%), or diamond (rotated square) based on content.shapeType; display optional content.text centered inside; apply style properties; accept node: BoardNode prop
- [X] T015 [US5] Create frontend/src/components/canvas/nodes/NodeRenderer.tsx — accept node: BoardNode prop; switch on node.type to render StickyNode, TextNode, or ShapeNode; return null for unknown types; used by NodeWrapper
- [X] T016 [US5] Create frontend/src/components/canvas/nodes/NodeWrapper.tsx — accept node: BoardNode and children; render an absolutely positioned div at (node.x, node.y) with width/height from node geometry, z-index from node.zIndex, rotation via CSS transform, apply node style properties (opacity, border); skip rendering if node.hidden is true; wrap children (NodeRenderer output)
- [X] T017 [P] [US5] Create frontend/src/hooks/useCanvasPan.ts — hook returns { panOffset, handlers }; on pointerdown on empty canvas area (not on a node), track pointermove to update panOffset {x, y}; on pointerup stop tracking; panOffset is applied as CSS translate on the canvas content layer
- [X] T018 [US5] Create frontend/src/components/canvas/Canvas.tsx — render a full-size container div (flex-1, overflow hidden, bg-gray-50); inside, render a content layer div with CSS transform translate(panOffset.x, panOffset.y); iterate nodesById from useBoardStore (filter out hidden), render NodeWrapper+NodeRenderer for each; attach useCanvasPan handlers to container; accept click handler prop for placement mode (Phase 4)
- [X] T019 [US5] Replace CanvasContainer with Canvas in frontend/src/components/layout/BoardWorkspace.tsx — import Canvas instead of CanvasContainer; update the JSX to render Canvas in the same flex position

**Checkpoint**: Open a board with seeded nodes. All node types render at correct positions with correct content and styles. Hidden nodes excluded. Canvas pans on empty-area drag.

---

## Phase 4: User Story 1 — Create a Node on the Board (Priority: P1) 🎯 MVP

**Goal**: User selects a node type from the toolbar, clicks on the canvas, and a node appears at the click position. The node is optimistically shown and confirmed by the backend.

**Independent Test**: Open a board, select Sticky from toolbar, click on canvas. Node appears. Repeat for Text and Shape. Reload board — all three nodes persist.

### Implementation for User Story 1

- [X] T020 [P] [US1] Create frontend/src/api/nodes.api.ts — export `createNode(boardId, body)` calling POST /boards/{boardId}/nodes with JSON body, returning {node, boardRevision}; export `updateNode(nodeId, patch)` calling PATCH /nodes/{nodeId} with Content-Type application/merge-patch+json, returning {node, boardRevision}; export `deleteNode(nodeId)` calling DELETE /nodes/{nodeId}, returning {success, deletedNodeId, deletedEdgeIds, boardRevision}; use apiRequest from client.ts; define response interfaces
- [X] T021 [P] [US1] Create frontend/src/components/canvas/CanvasToolbar.tsx — render a horizontal toolbar above or overlaying the canvas with buttons for Sticky, Text, Shape (rectangle default); clicking a button sets placementMode in store to that node type (highlight active button); clicking the active button again clears placementMode; read/set placementMode via useBoardStore
- [X] T022 [US1] Extend frontend/src/store/types.ts — add to UIState: `placementMode: BoardNode['type'] | null`; add `selectedNodeIds: string[]`; add `editingNodeId: string | null`; add PendingNode interface `{tempId: string, node: Partial<BoardNode>, status: 'pending' | 'failed', error?: string}`; add to BoardStore: `pendingNodes: Record<string, PendingNode>`, `setPlacementMode`, `addPendingNode`, `confirmNode`, `rollbackPendingNode`, `setSelectedNodeIds`
- [X] T023 [US1] Extend frontend/src/store/board.store.ts — add initial state: pendingNodes={}, extend ui with placementMode=null, selectedNodeIds=[], editingNodeId=null; implement `setPlacementMode(type|null)`; implement `addPendingNode(tempId, partialNode)` that adds to pendingNodes with status='pending'; implement `confirmNode(tempId, serverNode, boardRevision)` that removes from pendingNodes, adds serverNode to nodesById/nodeOrder, updates board.revision and sync.lastSyncedRevision; implement `rollbackPendingNode(tempId)` that removes from pendingNodes; implement `setSelectedNodeIds(ids)`; update reset() to clear new state
- [X] T024 [US1] Create frontend/src/hooks/useNodeMutations.ts — export `useNodeMutations()` hook; implement `createNodeAtPosition(type, x, y)`: generate tempId, compute default width/height/content per type (sticky: 200×120 {text:''}, text: 240×160 {text:'',title:''}, shape: 160×160 {shapeType:'rectangle'}), call store.addPendingNode, call nodes.api.createNode, on success call store.confirmNode, on failure call store.rollbackPendingNode; return { createNodeAtPosition }
- [X] T025 [US1] Wire placement flow in Canvas.tsx — read placementMode from store; when placementMode is set and user clicks on the canvas content layer (not on a node), compute canvas-relative position accounting for panOffset, call createNodeAtPosition(placementMode, x, y), then clear placementMode; render CanvasToolbar inside the Canvas container; also render pendingNodes from store with NodeWrapper+NodeRenderer (with pending visual style — subtle opacity)
- [X] T026 [US1] Guard archived boards — in CanvasToolbar, read board status from store; if board.status !== 'active', disable all toolbar buttons and show "Read-only" indicator; in Canvas click handler, skip placement if board is not active

**Checkpoint**: User can create sticky, text, and shape nodes via toolbar click → canvas click. Nodes appear immediately (optimistic). Server confirms. Board reload shows persisted nodes. Archived boards block creation.

---

## Phase 5: User Story 2 — Edit a Node's Content and Properties (Priority: P1)

**Goal**: User double-clicks a node to enter inline text editing. On blur, the edit is auto-saved to the backend. The server response becomes the confirmed state.

**Independent Test**: Create a sticky node, double-click it, change the text, click away. Reload the board — edited text persists.

### Implementation for User Story 2

- [X] T027 [P] [US2] Create frontend/src/components/canvas/nodes/InlineEditor.tsx — render a contenteditable div or textarea that auto-focuses on mount; accept initialValue (string), onCommit(newValue) callback, onCancel callback; on blur call onCommit with current text value; on Escape call onCancel; size to fill parent container; style to match node text appearance
- [X] T028 [US2] Extend frontend/src/store/board.store.ts — add `setEditingNodeId(id|null)` action; add `updateNodeOptimistic(nodeId, patch)` that snapshots current node, applies patch to nodesById entry locally; add `confirmNodeUpdate(nodeId, serverNode, boardRevision)` that replaces nodesById entry with server node, updates board.revision; add `rollbackNodeUpdate(nodeId, snapshot)` that restores nodesById entry from snapshot
- [X] T029 [US2] Extend frontend/src/hooks/useNodeMutations.ts — add `updateNodeContent(nodeId, contentPatch)` that calls store.updateNodeOptimistic to apply locally, calls nodes.api.updateNode with {content: contentPatch}, on success calls store.confirmNodeUpdate, on failure calls store.rollbackNodeUpdate with snapshot; add `updateNodeStyle(nodeId, stylePatch)` following same pattern with {style: stylePatch}
- [X] T030 [US2] Wire inline editing in StickyNode and TextNode — on double-click, call store.setEditingNodeId(node.id); when editingNodeId matches, render InlineEditor instead of static text; InlineEditor onCommit calls updateNodeContent with the new text; InlineEditor onCancel calls setEditingNodeId(null); prevent editing if node.locked (show locked indicator on click); clicking away from any node calls setEditingNodeId(null) via Canvas click handler

**Checkpoint**: Double-click a sticky/text node → edit text inline → click away → text persists on reload. Locked nodes reject editing.

---

## Phase 6: User Story 3 — Move and Resize a Node (Priority: P1)

**Goal**: User drags a node to reposition it. User drags resize handles to change dimensions. On release, the new geometry is saved to the backend.

**Independent Test**: Create a node, drag it to a new position, release. Reload — new position persists. Resize a node, release. Reload — new dimensions persist.

### Implementation for User Story 3

- [X] T031 [P] [US3] Create frontend/src/hooks/useNodeDrag.ts — hook accepts nodeId, onDragEnd(nodeId, newX, newY) callback; on pointerdown on node body (not resize handle), capture initial pointer position and node position; on pointermove, compute delta and update node position in store via a transient `setNodePosition(nodeId, x, y)` action (visual only, no API call); on pointerup, call onDragEnd with final position; skip if node.locked; return { dragHandlers }
- [X] T032 [P] [US3] Create frontend/src/hooks/useNodeResize.ts — hook accepts nodeId, onResizeEnd(nodeId, newWidth, newHeight) callback; on pointerdown on resize handle, capture initial pointer position and node dimensions; on pointermove, compute new width/height, clamp to min 20 and max 10000; on pointerup, call onResizeEnd; skip if node.locked; return { resizeHandlers, isResizing }
- [X] T033 [US3] Integrate drag and resize into NodeWrapper.tsx — add `setNodePosition(nodeId, x, y)` transient action to store (updates nodesById entry position without API call); attach useNodeDrag to node body area; render resize handles (small squares at corners) when node is selected (selectedNodeIds includes node.id); attach useNodeResize to resize handles; on drag end, call useNodeMutations.updateNodePosition(nodeId, x, y) which sends PATCH {x, y}; on resize end, call useNodeMutations.updateNodeDimensions(nodeId, w, h) which sends PATCH {width, height}; add updateNodePosition and updateNodeDimensions to useNodeMutations.ts using the same optimistic+reconcile pattern as updateNodeContent
- [X] T034 [US3] Add node selection to Canvas.tsx — on click on a NodeWrapper, set selectedNodeIds to [node.id] (single-select); on click on empty canvas, clear selectedNodeIds; pass isSelected prop to NodeWrapper; NodeWrapper renders selection outline (blue border, resize handles) when selected

**Checkpoint**: Drag nodes to reposition. Resize via handles. Positions/dimensions persist on reload. Locked nodes resist interaction.

---

## Phase 7: User Story 4 — Delete a Node (Priority: P2)

**Goal**: User selects a node and presses Delete. Node disappears with an undo toast. Connected edges also disappear. Backend confirms soft-delete.

**Independent Test**: Create a node (optionally with edges seeded via backend), delete it, reload board — node and connected edges are gone. Test undo: delete a node, click Undo on toast — node reappears.

### Implementation for User Story 4

- [X] T035 [P] [US4] Create frontend/src/components/shared/UndoToast.tsx — render a fixed-position toast at bottom-center with message text and an "Undo" button; auto-dismiss after 5 seconds via setTimeout; accept onUndo() callback (called when Undo clicked, dismisses immediately), onDismiss() callback (called on auto-dismiss or close), and message prop; use Tailwind for styling (bg-gray-800, text-white, rounded, shadow)
- [X] T036 [US4] Extend frontend/src/store/board.store.ts — add `deleteNodeOptimistic(nodeId)` action that: snapshots the node and all connected edges (edges where sourceNodeId or targetNodeId === nodeId) into a local undo record; removes node from nodesById/nodeOrder; removes connected edges from edgesById/edgeOrder; add `undoDeleteNode(snapshot)` that restores node and edges from snapshot; add `confirmNodeDelete(nodeId, deletedEdgeIds, boardRevision)` that ensures removal is finalized and updates board.revision
- [X] T037 [US4] Extend frontend/src/hooks/useNodeMutations.ts — add `deleteNodeWithUndo(nodeId)` that: checks node not locked (skip if locked, show error), calls store.deleteNodeOptimistic, shows UndoToast, calls nodes.api.deleteNode; on undo clicked before API response: call store.undoDeleteNode; on undo clicked after API confirmed: call store.undoDeleteNode (local only — server state is already deleted, accept divergence until next hydration); on API success without undo: call store.confirmNodeDelete; on API failure without undo: call store.undoDeleteNode and show error
- [X] T038 [US4] Wire delete interaction — in Canvas.tsx or a keyboard handler component, listen for Delete and Backspace key events when a node is selected (selectedNodeIds is non-empty); call deleteNodeWithUndo(selectedNodeIds[0]); also add a delete button/icon in NodeWrapper when selected (optional visual affordance); guard against locked nodes and archived boards; render UndoToast component conditionally when a delete is pending

**Checkpoint**: Select a node → press Delete → node disappears + toast appears. Click Undo → node reappears. Don't undo → reload confirms deletion. Cascade edges removed.

---

## Phase 8: User Story 6 — Understand Node Save States (Priority: P2)

**Goal**: User always knows whether a node is pending, saved, or failed. Pending nodes have a subtle visual indicator. Failed saves show clear error with retry option.

**Independent Test**: Simulate slow/failing network. Create a node — see pending indicator. Observe transition to confirmed. Simulate failure — see error indicator with retry.

### Implementation for User Story 6

- [X] T039 [US6] Extend frontend/src/store/board.store.ts — add `nodeMutationStatus: Record<string, 'pending' | 'confirmed' | 'failed'>` to state; update every mutation action (addPendingNode, updateNodeOptimistic, deleteNodeOptimistic) to set status to 'pending' for the affected nodeId; update every confirm action to set status to 'confirmed' (or remove entry); update every rollback action to set status to 'failed'; add `clearNodeMutationStatus(nodeId)` action; update reset() to clear nodeMutationStatus
- [X] T040 [US6] Extend NodeWrapper.tsx — read mutation status for node.id from store.nodeMutationStatus; when 'pending': add subtle pulse animation or reduced opacity (opacity-70) to the wrapper; when 'failed': add red outline (ring-2 ring-red-400), show a small retry icon/badge at top-right corner; when 'confirmed' or absent: render normally; render pending nodes from store.pendingNodes in Canvas with the same pending treatment
- [X] T041 [US6] Add retry affordance for failed mutations — when a node shows failed status, clicking the retry badge re-sends the last mutation (re-call createNode or updateNode depending on the pending mutation type); on successful retry, clear failed status and confirm; on failed retry, keep failed indicator; add a dismiss/remove option for failed pending create nodes (removeFailedPendingNode)

**Checkpoint**: Create/edit/move nodes — see pending → confirmed transition. Simulate failure — see red indicator with retry. Retry succeeds — indicator clears.

---

## Phase 9: Testing & Polish

**Purpose**: Validate all acceptance scenarios, verify cross-cutting concerns, ensure no regressions.

- [X] T042 [P] Write unit tests for node validation rules in backend/tests/unit/node-rules.unit.test.ts — test: assertNodeExists throws for null, throws for deleted_at set, passes for active node; assertNodeNotLocked throws for locked=true, passes for locked=false; validateNodeContent: sticky requires text 1–20000 chars, rejects missing/empty/over-limit; text requires text, validates optional title ≤ 500; shape requires shapeType in enum, validates optional text ≤ 5000; image requires assetId as UUID string
- [X] T043 [P] Write unit tests for merge-patch in backend/tests/unit/merge-patch.unit.test.ts — test: scalar overwrite, null removes key, absent key preserves, nested object recursive merge, array replaces entirely, empty patch returns copy of target, null patch key on nested object, deeply nested merge, does not mutate inputs
- [X] T044 Write integration tests for node CRUD + cascade in backend/tests/integration/nodes.integration.test.ts — against real DB; test: (1) create sticky/text/shape nodes with correct content, (2) create node bumps revision and writes create_node operation, (3) update node position/content merges correctly, (4) update node bumps revision and writes update_node operation, (5) merge-patch on content/style/metadata works per RFC 7396, (6) delete node sets deleted_at and writes delete_node operation, (7) delete node cascades to connected edges and writes delete_edge operations, (8) delete cascade + node use same revision, (9) locked node rejects update and delete, (10) archived board rejects all node mutations, (11) soft-deleted node is not found by update/delete
- [X] T045 Write HTTP contract tests for node endpoints in backend/tests/contract/nodes.contract.test.ts — test: POST /boards/{boardId}/nodes returns 201 with node + boardRevision; POST with invalid content returns 422; POST on non-existent board returns 404; POST on archived board returns 409; PATCH /nodes/{nodeId} returns 200 with updated node + boardRevision; PATCH with wrong content-type returns 415; PATCH locked node returns 409; DELETE /nodes/{nodeId} returns 200 with deletedNodeId + deletedEdgeIds + boardRevision; DELETE locked node returns 409; DELETE non-existent returns 404
- [X] T046 Run quickstart.md verification checklist — execute all curl verification steps from specs/005-node-crud/quickstart.md: create nodes of each type, update position and content, delete with cascade, hydrate to confirm state
- [X] T047 Code review: verify constitution compliance — confirm: all mutations use withBoardMutation (Principle III/V), revision bumps exactly once per mutation (Principle II), operation log entries for every durable mutation (Principle III), no hardcoded limits (Principle X), merge-patch content-type enforced (Principle VI), structured logging on mutations (Principle X), error envelope consistency (Principle VI), frontend reconciles from server response (Principle I)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (limits and OpenAPI) — **BLOCKS all frontend mutation stories (US1–US4)**
- **US5 (Phase 3)**: Depends on Phase 1 only — can start in parallel with Phase 2 (read-only rendering uses existing hydration endpoint)
- **US1 (Phase 4)**: Depends on Phase 2 (backend create endpoint) + Phase 3 (canvas rendering)
- **US2 (Phase 5)**: Depends on Phase 4 (needs nodes to exist for editing)
- **US3 (Phase 6)**: Depends on Phase 4 (needs nodes to exist for moving); can run in parallel with US2 (different hooks/files)
- **US4 (Phase 7)**: Depends on Phase 4 (needs nodes to exist for deleting); can run in parallel with US2/US3
- **US6 (Phase 8)**: Depends on Phases 4–7 (status indicators build on all mutation flows)
- **Testing & Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US5 (P1)**: Can start after Phase 1 — independent of backend endpoint work
- **US1 (P1)**: Depends on Phase 2 (backend) + US5 (canvas to render on)
- **US2 (P1)**: Depends on US1 (needs created nodes to edit)
- **US3 (P1)**: Depends on US1 (needs created nodes to move); independent of US2
- **US4 (P2)**: Depends on US1 (needs created nodes to delete); independent of US2/US3
- **US6 (P2)**: Depends on US1–US4 (status indicators for all mutation types)

### Within Each User Story

- Store type definitions before store actions
- Store actions before hooks that use them
- Hooks before components that wire them
- Component rendering before interaction wiring

### Parallel Opportunities

Phase 1 + Phase 3 (US5) can overlap — US5 only needs existing hydration, not the new node endpoints.

Within Phase 2 (after Phase 1):
- T003 (node-rules), T004 (merge-patch), T005 (Zod schemas), T006 (nodes.repo), T007 (edges.repo) can all run in parallel (different files)
- T008 (service) depends on T003–T007
- T009 (controller) depends on T005, T008
- T010 (router) depends on T009
- T011 (error-handler) depends on T003

Within Phase 3 (US5):
- T012 (StickyNode), T013 (TextNode), T014 (ShapeNode), T017 (useCanvasPan) can all run in parallel (different files)
- T015 (NodeRenderer) depends on T012–T014
- T016 (NodeWrapper) can run in parallel with T015
- T018 (Canvas) depends on T015–T017
- T019 depends on T018

Within Phase 4 (US1):
- T020 (nodes.api), T021 (CanvasToolbar) can run in parallel
- T022 (types) → T023 (store) → T024 (hook) → T025 (wiring) → T026 (guards) sequential

Across user stories after Phase 4:
- US2 (Phase 5), US3 (Phase 6), US4 (Phase 7) can partially overlap — US2 and US3 touch different hooks/files; US4 is also independent. Main constraint: all modify board.store.ts and useNodeMutations.ts sequentially.

Within Phase 9:
- T042 (node-rules tests) and T043 (merge-patch tests) can run in parallel
- T044 (integration) depends on unit tests for confidence
- T045 (contract) depends on T044
- T046 (quickstart verification) runs after all tests pass

---

## Parallel Example: Phase 2 Foundational

```text
# After Phase 1 completes, launch in parallel:
Task T003: "Create node validation rules in backend/src/domain/validation/node-rules.ts"
Task T004: "Create merge-patch utility in backend/src/domain/patch/merge-patch.ts"
Task T005: "Create Zod schemas in backend/src/schemas/node.schemas.ts"
Task T006: "Extend nodes.repo.ts with insert/update/softDelete"
Task T007: "Extend edges.repo.ts with cascade softDeleteByNodeId"

# After T003–T007 complete:
Task T008: "Create nodes.service.ts"

# After T008 completes:
Task T009: "Create nodes.controller.ts"
Task T011: "Update error-handler.ts for NodeError types"

# After T009 completes:
Task T010: "Register node routes in router.ts"
```

## Parallel Example: Phase 3 US5 Rendering

```text
# Can start during Phase 2 (no backend dependency):
Task T012: "Create StickyNode.tsx"
Task T013: "Create TextNode.tsx"
Task T014: "Create ShapeNode.tsx"
Task T017: "Create useCanvasPan.ts"

# After node components complete:
Task T015: "Create NodeRenderer.tsx"
Task T016: "Create NodeWrapper.tsx"

# After all canvas pieces:
Task T018: "Create Canvas.tsx"
Task T019: "Replace CanvasContainer in BoardWorkspace.tsx"
```

---

## Implementation Strategy

### MVP First (US5 + US1 Only)

1. Complete Phase 1: Setup (OpenAPI + config limits)
2. Complete Phase 2: Foundational backend (all 3 endpoints)
3. Complete Phase 3: US5 (canvas rendering from hydrated state)
4. Complete Phase 4: US1 (node creation via toolbar)
5. **STOP and VALIDATE**: User can create nodes and see them persist. This is the minimum useful increment — a board is now a real workspace.

### Incremental Delivery

1. Setup + Foundational → Backend fully functional (curl-testable)
2. Add US5 (rendering) → Canvas shows seeded nodes
3. Add US1 (create) → **MVP: boards come alive** 🎯
4. Add US2 (edit) → Content editing works
5. Add US3 (move/resize) → Spatial arrangement works
6. Add US4 (delete) → Cleanup and refinement
7. Add US6 (save states) → User trust and clarity
8. Testing & Polish → Production-ready slice

### Single Developer Strategy

Recommended sequential order:

1. Phase 1 → Phase 2 (backend, ~35% of effort)
2. Phase 3 → Phase 4 (rendering + create, ~25% of effort — **MVP checkpoint**)
3. Phase 5 → Phase 6 → Phase 7 → Phase 8 (remaining interactions, ~25% of effort)
4. Phase 9 (tests + polish, ~15% of effort)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- The store file (board.store.ts) is modified across multiple stories — these modifications are sequential and additive. Each story adds new actions/state without changing existing ones.
- The useNodeMutations.ts hook is extended across US1, US2, US3, US4 — each story adds new exported functions.
- The NodeWrapper.tsx component is extended across US3, US5, US6 — each story adds interaction or visual behavior.
- Backend work is consolidated in Phase 2 because all three endpoints share foundational infrastructure. Splitting create/update/delete into separate phases would create artificial boundaries in the same service file.
- US5 (rendering) can start before backend endpoints are complete — it only reads from existing hydration.
- Commit after each completed phase or user story.
- Stop at any checkpoint to validate the story independently.
