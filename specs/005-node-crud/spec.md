# Feature Specification: Node CRUD

**Feature Branch**: `005-node-crud`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Create the next feature spec for Context Board MVP: 005-node-crud. POST /boards/{boardId}/nodes, PATCH /nodes/{nodeId}, DELETE /nodes/{nodeId}, core node validation for geometry, content, style, metadata, lock state, soft-delete behavior for nodes, cascade soft-delete of connected edges when a node is deleted, board canvas rendering of confirmed nodes, node create/edit/move/delete interactions in the browser, pending/saved/failed node UI states with response reconciliation."

## Clarifications

### Session 2026-03-16

- Q: Should this slice include basic canvas panning (drag on empty canvas to scroll)? → A: Yes, basic pan only (drag on empty canvas); zoom and viewport optimizations remain out of scope.
- Q: Where should a newly created node appear on the canvas? → A: Two-step placement — user activates the node type from the toolbar, then clicks on the canvas to place it at that location.
- Q: When should text edits inside a node be committed to the backend? → A: Auto-save on blur — edits are sent to the backend when the user clicks away from the node.
- Q: Should deleting a node require a confirmation step? → A: Lightweight confirmation — a brief toast with an "Undo" option appears after delete. The delete request is sent immediately; undo cancels the optimistic removal before or after server confirmation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create a Node on the Board (Priority: P1)

A user opens an existing board and selects a node type from the toolbar (sticky, text, or shape). The toolbar enters a placement mode. The user then clicks on the canvas to place the node at that location. The node appears immediately at the click position, and within moments the system confirms it has been saved. The confirmed node becomes part of the board's durable state and is visible on reload.

**Why this priority**: Creating nodes is the foundational board editing action. Every other canvas interaction—editing, moving, connecting, deleting—depends on nodes existing first. This is the first moment the board becomes a real visual workspace rather than an empty shell.

**Independent Test**: Can be fully tested by opening a board, triggering a create action for each supported type (sticky, text, shape), and confirming each node appears on the canvas with server-confirmed state. Reloading the board should show the same nodes.

**Acceptance Scenarios**:

1. **Given** an active board with the canvas visible, **When** the user selects "Sticky" from the toolbar and clicks on the canvas, **Then** a sticky node appears at the click position and is confirmed by the backend with a new revision.
2. **Given** an active board, **When** the user creates a text node with a title and body text, **Then** the node appears on the canvas and is durably saved.
3. **Given** an active board, **When** the user creates a shape node with a valid shape type (rectangle, ellipse, or diamond), **Then** the node appears on the canvas with the correct shape representation and is durably saved.
4. **Given** an active board, **When** the user creates a node and the backend request is still in progress, **Then** the node is visually present on the canvas in a pending state and the user is not blocked from other interactions.
5. **Given** the user has created a node, **When** the backend confirms the creation, **Then** the node transitions from pending to confirmed state and the board revision is updated from the server response.
6. **Given** the user has created a node, **When** the backend rejects the creation (e.g., invalid content), **Then** the user sees a clear failure indication and the pending node is removed or marked as failed without corrupting confirmed board state.
7. **Given** an archived board, **When** the user attempts to create a node, **Then** the system prevents the action and communicates that the board is read-only.

---

### User Story 2 — Edit a Node's Content and Properties (Priority: P1)

A user selects an existing node on the canvas and changes its text, title, style, or metadata. The change is reflected locally as the user types. When the user clicks away from the node (blur), the edit is automatically saved to the backend. The confirmed state comes from the server response.

**Why this priority**: Editing is the natural follow-up to creation. A board where nodes cannot be changed after placement is not useful for real thinking and planning work. Editing must feel direct, low-friction, and reliably saved.

**Independent Test**: Can be tested by creating a node, selecting it, editing its text content, and confirming the updated content persists after a board reload.

**Acceptance Scenarios**:

1. **Given** an existing sticky node on the canvas, **When** the user edits its text content and clicks away (blur), **Then** the edit is automatically sent to the backend and the node reflects the server-confirmed content.
2. **Given** an existing text node, **When** the user changes its title, **Then** the updated title is saved and confirmed by the backend.
3. **Given** an existing node, **When** the user updates its style properties (e.g., background color, text color), **Then** the style change is saved and the node renders with the new style.
4. **Given** an existing node, **When** the user updates its metadata, **Then** the metadata change is saved and confirmed by the backend.
5. **Given** a node currently being edited, **When** the backend rejects the update (e.g., text exceeds length limit), **Then** the user sees a clear error and the node reverts to the last confirmed state.
6. **Given** a locked node, **When** the user attempts to edit it, **Then** the system prevents the edit and communicates that the node is locked.

---

### User Story 3 — Move and Resize a Node (Priority: P1)

A user drags a node to reposition it on the canvas or resizes it by adjusting its dimensions. The node moves fluidly during the interaction, and when the user releases, the final position or size is saved to the backend. The confirmed geometry comes from the server response.

**Why this priority**: Spatial arrangement is central to a visual workspace. Without the ability to position and size nodes, the canvas cannot support meaningful layouts or spatial thinking. This is equally critical as content editing for making the board useful.

**Independent Test**: Can be tested by creating a node, dragging it to a new position, releasing, and confirming the new position persists after a board reload.

**Acceptance Scenarios**:

1. **Given** a node on the canvas, **When** the user drags it to a new position, **Then** the node moves fluidly with the cursor during the drag.
2. **Given** the user has finished dragging a node, **When** they release, **Then** the final position is sent to the backend as a patch and the confirmed position comes from the server response.
3. **Given** the user drags a node, **When** the position save fails, **Then** the node returns to its last confirmed position and the user sees a failure indication.
4. **Given** a locked node, **When** the user attempts to drag it, **Then** the node does not move and the system communicates that it is locked.
5. **Given** a node on the canvas, **When** the user resizes it to valid dimensions, **Then** the new dimensions are saved and confirmed by the backend.
6. **Given** the user attempts to resize a node to invalid dimensions (e.g., zero width), **Then** the system prevents the resize or the backend rejects it and the node returns to valid dimensions.

---

### User Story 4 — Delete a Node (Priority: P2)

A user selects a node and deletes it from the board. The node disappears from the canvas immediately, and a brief toast appears with an "Undo" option. Any edges connected to that node also disappear. If the user does not undo, the deletion is confirmed by the backend. After deletion, reloading the board confirms the node and its connected edges are no longer part of the active board state.

**Why this priority**: Deletion is essential for board maintenance and reorganization. Without it, mistakes are permanent and the canvas becomes cluttered. It is slightly lower priority than create/edit/move because those establish the core editing loop, while delete supports cleanup and refinement.

**Independent Test**: Can be tested by creating a node (optionally with connected edges via backend seeding), deleting the node, and confirming neither the node nor its connected edges appear after a board reload.

**Acceptance Scenarios**:

1. **Given** a node on the canvas, **When** the user deletes it, **Then** the node is visually removed from the canvas immediately and a brief toast with an "Undo" option appears.
2. **Given** the user has deleted a node and the toast is visible, **When** the user clicks "Undo" before the toast expires, **Then** the node reappears on the canvas at its last confirmed state and no delete request is sent (or the delete is rolled back if already sent).
3. **Given** the user has deleted a node, **When** the backend confirms the deletion, **Then** the node no longer appears in the board's active state and the board revision is updated.
4. **Given** a node with connected edges, **When** the user deletes the node, **Then** all edges connected to that node are also removed from the active board state in the same operation.
5. **Given** the user has deleted a node, **When** the backend rejects the deletion, **Then** the node reappears on the canvas at its last confirmed state and the user sees an error message.
6. **Given** a locked node, **When** the user attempts to delete it, **Then** the system prevents the deletion and communicates that the node is locked.
7. **Given** an archived board, **When** the user attempts to delete a node, **Then** the system prevents the action and communicates that the board is read-only.

---

### User Story 5 — See Confirmed Nodes on the Canvas (Priority: P1)

When a user opens a board, all confirmed nodes are rendered on the canvas in their correct positions, sizes, and visual styles. The canvas accurately reflects the durable board state as returned by the backend. Each node type is visually distinguishable.

**Why this priority**: Canvas rendering is the visual foundation that makes all other node interactions meaningful. Without it, create/edit/move/delete have no visible surface. This story is P1 because it is the prerequisite for every canvas interaction to be useful.

**Independent Test**: Can be tested by seeding a board with several nodes of different types (sticky, text, shape), opening the board, and confirming each node renders in the correct position with appropriate visual treatment.

**Acceptance Scenarios**:

1. **Given** a board with sticky nodes, **When** the user opens the board, **Then** each sticky node renders at its saved position with its text content visible.
2. **Given** a board with text nodes, **When** the user opens the board, **Then** each text node renders with its title (if present) and body text visible.
3. **Given** a board with shape nodes, **When** the user opens the board, **Then** each shape node renders with the correct shape (rectangle, ellipse, or diamond) at its saved position.
4. **Given** a board with nodes of mixed types, **When** the user opens the board, **Then** all nodes render in the correct z-order layering.
5. **Given** a board with nodes that have custom styles, **When** the user opens the board, **Then** each node renders with its stored style properties (colors, font size, borders).
6. **Given** a board with hidden nodes, **When** the user opens the board, **Then** hidden nodes are not displayed on the canvas.

---

### User Story 6 — Understand Node Save States (Priority: P2)

As the user creates, edits, moves, or deletes nodes, they always understand whether their changes are pending, saved, or failed. Pending changes are visually distinguishable from confirmed state. Failed saves produce clear feedback. The user never has to guess whether a node exists durably on the backend.

**Why this priority**: Save-state clarity prevents data loss anxiety and builds trust in the workspace. Without it, users cannot be confident their work is preserved. It supports all other node interactions but sits below them in priority because the interactions themselves must work first.

**Independent Test**: Can be tested by creating or editing a node under simulated slow or failing network conditions and confirming the UI shows appropriate pending, success, and failure states.

**Acceptance Scenarios**:

1. **Given** the user has just created a node, **When** the save request is in progress, **Then** the node appears on the canvas with a subtle pending indicator.
2. **Given** the user has edited a node, **When** the save succeeds, **Then** the pending indicator disappears and the node shows confirmed state.
3. **Given** the user has created a node, **When** the save fails, **Then** the node shows a failure indicator and the user can retry or dismiss.
4. **Given** the user has moved a node, **When** the position save fails, **Then** the node returns to its last confirmed position.
5. **Given** the user has deleted a node, **When** the deletion fails, **Then** the node reappears on the canvas and the user sees an error.

---

### Edge Cases

- What happens when the user creates a node with text content exceeding the maximum length? The backend rejects the creation with a validation error, and the user sees a clear message about the content limit.
- What happens when the user attempts to create a node on a board that was deleted by another process? The backend returns a "board not found" error, and the user is informed that the board is no longer available.
- What happens when the user rapidly creates multiple nodes in succession? Each creation is handled independently; the system does not lose or duplicate any nodes, and each receives proper server confirmation.
- What happens when the user edits a node that was concurrently deleted (e.g., by an agent apply in a future flow)? The backend returns "node not found" and the frontend removes the stale node from the canvas.
- What happens when the user tries to resize a node to dimensions exceeding the maximum allowed? The backend rejects the update and the node retains its last valid dimensions.
- What happens when a node delete cascade affects edges that are currently selected in the UI? The selection is cleared for any entities that were removed by the cascade.
- What happens when the user creates a shape node with an unsupported shape type? The system prevents submission of unsupported types through the UI, and the backend rejects any unsupported values that reach it.
- What happens when the user creates a node while offline or the backend is unreachable? The node shows a failure state, and the user can retry when connectivity is restored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow the user to create sticky nodes with text content on an active board.
- **FR-002**: System MUST allow the user to create text nodes with text content and an optional title on an active board.
- **FR-003**: System MUST allow the user to create shape nodes with one of the allowed shape types (rectangle, ellipse, diamond) on an active board.
- **FR-004**: System MUST validate node geometry on creation—width and height must be greater than zero and within the allowed maximum.
- **FR-005**: System MUST validate node content according to the rules for each node type (e.g., sticky requires text, shape requires a valid shape type).
- **FR-006**: System MUST reject node creation on boards that are archived or deleted.
- **FR-007**: System MUST return the created node with a server-assigned identity and update the board revision on successful creation.
- **FR-008**: System MUST allow the user to update a node's position, dimensions, rotation, z-index, content, style, and metadata through a partial update.
- **FR-009**: System MUST use merge-patch semantics for node updates—scalar fields overwrite, nested objects merge, arrays replace fully, null removes a key.
- **FR-010**: System MUST reject updates to locked nodes and communicate the locked state to the user.
- **FR-011**: System MUST reject node updates that produce invalid content for the node type (e.g., removing required text from a sticky).
- **FR-012**: System MUST return the updated node and update the board revision on successful update.
- **FR-013**: System MUST allow the user to delete a node, resulting in a soft delete. A brief toast with an "Undo" option MUST appear after deletion, allowing the user to reverse the action before it is finalized.
- **FR-014**: System MUST cascade-soft-delete all edges connected to a deleted node within the same operation.
- **FR-015**: System MUST reject deletion of locked nodes.
- **FR-016**: System MUST reject node deletion on boards that are archived or deleted.
- **FR-017**: System MUST exclude soft-deleted nodes from the normal board state response.
- **FR-018**: System MUST update the board revision exactly once per successful node mutation (create, update, or delete including cascaded edge deletions).
- **FR-019**: System MUST write an operation log entry for every durable node mutation, using the same revision as the committed change.
- **FR-020**: System MUST render confirmed nodes on the board canvas at their stored positions, dimensions, and z-order after hydration.
- **FR-021**: System MUST visually distinguish each node type on the canvas (sticky, text, shape with correct shape rendering).
- **FR-022**: System MUST provide toolbar actions for creating sticky, text, and shape nodes using a two-step flow: the user selects a node type from the toolbar (entering placement mode), then clicks on the canvas to place the node at that location.
- **FR-023**: System MUST support inline text editing for sticky and text nodes directly on the canvas, with auto-save on blur — the edit is committed to the backend when the user clicks away from the node.
- **FR-024**: System MUST support drag-to-move interactions for node repositioning on the canvas.
- **FR-025**: System MUST support node resize interactions on the canvas.
- **FR-026**: System MUST display pending, saved, and failed states for node mutations so the user always understands the save status.
- **FR-027**: System MUST reconcile node state from server responses after every mutation—the server response defines the final confirmed state.
- **FR-028**: System MUST allow optimistic UI for node mutations as a temporary convenience, but MUST replace optimistic state with server-confirmed state upon response.
- **FR-029**: System MUST roll back optimistic changes when a mutation fails, restoring the last confirmed state.
- **FR-030**: System MUST apply node styles (background color, text color, font size, border) during canvas rendering.
- **FR-031**: System MUST respect the hidden flag—hidden nodes are not rendered on the canvas.
- **FR-032**: System MUST prevent all mutating node interactions on archived boards and communicate the read-only state.
- **FR-033**: System MUST support basic canvas panning (drag on empty canvas area) so the user can reach nodes placed beyond the initial visible viewport. Zoom is not included in this slice.

### Key Entities

- **Node**: A visual object on the board canvas. Has a type (sticky, text, or shape), geometry (position, dimensions, rotation, z-index), content specific to its type, optional style and metadata, and lifecycle flags (locked, hidden, deleted). Nodes belong to exactly one board.
- **Node Content (Sticky)**: Contains text (required, max 20,000 characters).
- **Node Content (Text)**: Contains text (required, max 20,000 characters) and an optional title.
- **Node Content (Shape)**: Contains a shape type (required; one of rectangle, ellipse, diamond) and optional text.
- **Board Revision**: A monotonically increasing number that increments once per successful durable mutation batch. Updated from the server response after every confirmed mutation.
- **Operation Log Entry**: A durable record of each node mutation, including the operation type, affected entity, and the board revision at the time of commit.

## Scope Boundaries

### In Scope

- Backend: `POST /boards/{boardId}/nodes` — create a single node
- Backend: `PATCH /nodes/{nodeId}` — partial update a node using merge-patch semantics
- Backend: `DELETE /nodes/{nodeId}` — soft-delete a node and cascade-soft-delete connected edges
- Backend validation for node geometry, content by type, style, metadata, and lock state
- Backend revision increment and operation log write for every node mutation
- Frontend: Canvas rendering of confirmed sticky, text, and shape nodes from hydrated state
- Frontend: Node creation affordances (toolbar or equivalent) for sticky, text, and shape types
- Frontend: Inline editing for node content on the canvas
- Frontend: Drag-to-move and resize interactions for nodes
- Frontend: Node delete interaction
- Frontend: Pending, saved, and failed mutation states with clear visual feedback
- Frontend: Response reconciliation — replacing optimistic state with server-confirmed state
- Frontend: Rollback on mutation failure
- Frontend: Basic canvas panning (drag on empty canvas area to scroll the viewport) so nodes beyond the initial visible area are reachable

### Explicitly Out of Scope

- Asset upload and retrieval
- Image node happy path that depends on uploaded assets
- Edge CRUD as a standalone capability (edges are only affected here via cascade on node delete)
- Batch node mutation endpoint
- Chat and agent flows
- Operations polling
- Canvas zoom and viewport-based rendering optimizations (basic pan is in scope; zoom is not)
- Node restore from soft delete
- Multi-select or grouped node operations

## Assumptions

- The backend APIs for board creation, board listing, board state hydration, and the revision/operations infrastructure are already implemented and available from prior slices (S1, S2, S3, S3.5).
- The frontend app shell, routing, board create/open flow, hydration integration, and the canvas placeholder surface from S3.5 are available and ready to be extended with real node rendering and interactions.
- The MVP is single-user with no authentication.
- Image nodes are a supported node type at the data model level, but the full image node experience (asset upload, asset reference, image rendering) is deferred to the Assets + Image Nodes slice. Image node creation that references a valid asset should work at the API level, but the frontend does not need to provide a complete image node creation flow in this slice.
- Node text content maximum is 20,000 characters.
- Node width and height must be greater than zero and at most 10,000.
- Locked nodes cannot be mutated through normal edit or delete endpoints.
- The frontend uses optimistic UI for responsiveness but treats the server response as the final source of truth.
- Edge cascade on node delete is handled entirely by the backend within the same transaction; the frontend trusts the server response for the final set of removed entities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a sticky node, a text node, and a shape node on a board, and all three appear on the canvas within 2 seconds of the user action under normal conditions.
- **SC-002**: A user can edit any node's text content and see the confirmed update reflected on the canvas and persisted across board reloads.
- **SC-003**: A user can drag a node to a new position, and the new position is confirmed by the backend and persisted across board reloads.
- **SC-004**: A user can delete a node, and both the node and its connected edges disappear from the active board state, confirmed across board reloads.
- **SC-005**: Every node mutation (create, update, delete) results in exactly one board revision increment and at least one operation log entry.
- **SC-006**: Locked nodes visibly resist all edit and delete attempts, with a clear explanation shown to the user.
- **SC-007**: The user can always distinguish between a node that is being saved, one that has been confirmed, and one whose save has failed—no ambiguous states exist.
- **SC-008**: When a node mutation fails, the canvas returns to the last confirmed state without leaving ghost nodes, stale positions, or orphaned visual artifacts.
- **SC-009**: All three basic node types (sticky, text, shape) render visually distinct representations on the canvas with correct geometry, content, and styling.
- **SC-010**: A board reload after any sequence of node mutations shows exactly the durable state confirmed by the backend—no local-only artifacts survive a reload.
