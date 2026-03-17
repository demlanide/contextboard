# Feature Specification: Edge CRUD

**Feature Branch**: `006-edge-crud`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Create, update, and delete edges (relationships) between nodes on a board, with validation, visual connection interaction, preview feedback, and rollback-safe behavior."

## Clarifications

### Session 2026-03-16

- Q: Are edge endpoints (source/target) mutable via update, or immutable after creation? → A: Immutable. Users delete and recreate to re-point an edge. Update applies only to label, style, and metadata.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Two Nodes (Priority: P1)

A user working on a board wants to create a visible relationship between two existing nodes. They initiate a connection from one node by dragging from its connection handle and release on a second node. The system validates the connection and, if accepted, persists and displays the new edge.

**Why this priority**: Creating edges is the foundational action of this feature. Without it, no relationships can be expressed on a board, and all other edge capabilities (update, delete, preview) have no meaning.

**Independent Test**: Can be fully tested by creating two nodes on a board, connecting them via drag interaction, and verifying the confirmed edge appears. Delivers the core value of visible relationships between board items.

**Acceptance Scenarios**:

1. **Given** a board with two active nodes, **When** the user drags from node A's connection handle to node B and releases, **Then** a confirmed edge is created linking node A to node B and is visible on the board.
2. **Given** a board with two active nodes, **When** the user completes a valid connection, **Then** the system records the edge and increments the board's revision exactly once.
3. **Given** a board with two active nodes, **When** the user creates an edge with an optional label, **Then** the edge is persisted with that label and displayed accordingly.

---

### User Story 2 - Visual Feedback During Connection (Priority: P2)

While a user is in the process of connecting two nodes, they see a temporary preview edge that follows their cursor. Valid drop targets are visually distinguished from invalid ones, so the user understands where they can and cannot connect before releasing.

**Why this priority**: Without real-time visual feedback, users cannot confidently form connections. This story makes the interaction intuitive and prevents confusion, but depends on the core connection capability from Story 1.

**Independent Test**: Can be tested by initiating a drag from a connection handle and observing: (a) a preview edge follows the cursor, (b) valid target nodes show a distinct visual state, (c) invalid targets (e.g., the same node) show a different visual state or no affordance.

**Acceptance Scenarios**:

1. **Given** a user starts dragging from a node's connection handle, **When** the cursor moves across the canvas, **Then** a temporary preview edge is drawn from the source node to the cursor position.
2. **Given** a user is dragging a connection, **When** the cursor hovers over a valid target node, **Then** that node displays a visual indicator that it is a valid drop target.
3. **Given** a user is dragging a connection, **When** the cursor hovers over the source node itself (self-loop), **Then** that node does not display a valid-target indicator.
4. **Given** a user releases the drag on empty canvas (no target node), **When** the connection attempt ends, **Then** the preview edge disappears and no edge is created.

---

### User Story 3 - Delete an Edge (Priority: P2)

A user decides a relationship between two nodes is no longer relevant. They select the edge and delete it. The edge disappears from the board and is no longer included in the normal board view, though it is preserved internally for audit purposes.

**Why this priority**: Deletion is essential for users to maintain clean, accurate boards. It shares priority with visual feedback since both are required for a usable MVP experience.

**Independent Test**: Can be tested by creating an edge, then deleting it and verifying it no longer appears on the board. Re-hydrating the board confirms it remains absent from normal state.

**Acceptance Scenarios**:

1. **Given** a board with an existing edge, **When** the user deletes that edge, **Then** the edge is removed from the visible board state.
2. **Given** a deleted edge, **When** the board is reloaded, **Then** the deleted edge does not appear in the normal board view.
3. **Given** an edge deletion, **When** the system processes it, **Then** the board's revision is incremented exactly once and an operation record is created.

---

### User Story 4 - Update an Edge (Priority: P3)

A user wants to refine a relationship — for instance, adding or changing a label that describes what the edge means, or adjusting its visual style. They select the edge, modify its properties, and save. The changes are persisted and reflected immediately.

**Why this priority**: Updating edges adds expressiveness but is not required for basic relationship creation or removal. Users can work with default edges initially.

**Independent Test**: Can be tested by creating an edge, then modifying its label or style properties and verifying the updated values persist and display correctly.

**Acceptance Scenarios**:

1. **Given** an existing edge, **When** the user changes its label, **Then** the updated label is persisted and displayed on the board.
2. **Given** an existing edge, **When** the user updates its style properties, **Then** the visual appearance of the edge reflects the changes.
3. **Given** an edge update, **When** the system processes it, **Then** the board's revision is incremented exactly once and an operation record is created.

---

### User Story 5 - Graceful Failure Handling (Priority: P3)

When a connection attempt fails — for example, because the target node was deleted by another session between the time the user started dragging and released — the system rolls back cleanly. No ghost edges remain on the board, and the user sees a clear indication that the connection was not created.

**Why this priority**: Failure handling is important for data integrity and user trust, but represents an uncommon path. The core happy paths take precedence.

**Independent Test**: Can be tested by simulating a failed edge creation (e.g., targeting a node that no longer exists) and verifying that no phantom edge remains visible and an understandable error is presented.

**Acceptance Scenarios**:

1. **Given** a user attempts to connect to a node that was deleted after the drag began, **When** the server rejects the request, **Then** the preview/pending edge disappears completely and an error message is shown.
2. **Given** any edge creation failure, **When** the system rolls back, **Then** no ghost or orphan edges remain visible on the board.
3. **Given** a failed edge creation, **When** the user retries with a valid target, **Then** the new connection succeeds normally without interference from the prior failure.

---

### Edge Cases

- What happens when a user tries to connect a node to itself? The system rejects the self-loop, the preview indicates the source node is not a valid target, and no edge is created.
- What happens when the target node is deleted by another user while a connection drag is in progress? The server rejects the creation, the preview edge disappears, and no ghost edge remains.
- What happens when a user deletes a node that has connected edges? All edges connected to that node are also removed from the board in the same operation. The board revision increments once for the entire cascaded operation.
- What happens when a user tries to create a duplicate edge between the same two nodes? The system accepts it — duplicate edges are allowed in MVP (multiple relationships between the same pair of nodes are valid).
- What happens when a user tries to delete an already-deleted edge? The request is handled gracefully without error — the operation is effectively idempotent.
- What happens when the board is archived? Edge mutations (create, update, delete) are rejected. The board must be in an editable state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create an edge between two active nodes on the same board.
- **FR-002**: System MUST reject edge creation when the source and target nodes are on different boards.
- **FR-003**: System MUST reject edge creation when source and target refer to the same node (self-loop).
- **FR-004**: System MUST reject edge creation when either the source or target node has been deleted.
- **FR-005**: System MUST reject edge creation when either the source or target node does not exist.
- **FR-006**: System MUST allow users to update an edge's label, style, and metadata properties using a partial-update approach. Source and target node references are immutable after creation.
- **FR-007**: System MUST reject edge update requests that attempt to change immutable fields (source node, target node) or supply invalid values for mutable fields.
- **FR-008**: System MUST support soft-deletion of edges so that deleted edges are excluded from the normal board view but preserved internally.
- **FR-009**: System MUST reject edge mutations (create, update, delete) on archived or non-editable boards.
- **FR-010**: System MUST increment the board revision exactly once per successful edge mutation.
- **FR-011**: System MUST record an operation log entry for every successful edge mutation (create, update, delete).
- **FR-012**: System MUST display a temporary preview edge while the user is in the process of connecting two nodes.
- **FR-013**: System MUST visually distinguish valid drop targets from invalid ones during a connection drag.
- **FR-014**: System MUST remove preview/pending edges and show an error when an edge creation request fails, leaving no ghost edges on the board.
- **FR-015**: System MUST cascade-remove edges connected to a node when that node is deleted, within the same operation.
- **FR-016**: System MUST treat the server as the authoritative source of validation, even when the client prevents obviously invalid connections in the UI.

### Key Entities

- **Edge**: A directional relationship between two nodes on the same board. Key attributes: source node, target node, optional label, visual style properties, arbitrary metadata, deletion state, creation and modification timestamps.
- **Board**: The container for nodes and edges. Maintains a revision counter that increments with every successful mutation. Has an editability state that governs whether mutations are accepted.
- **Node**: A board item that can serve as the source or target of an edge. Must be active (not deleted) and belong to the same board as the edge.
- **Operation**: An audit record capturing each mutation. Linked to a specific board revision. Records the type of change (create, update, or delete edge) and associated data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a valid edge between two nodes on a board within a single drag-and-release interaction, with the confirmed edge visible immediately.
- **SC-002**: 100% of invalid edge attempts (self-loop, cross-board, deleted-node target) are rejected with a clear, understandable reason — both by proactive UI feedback and by authoritative server validation.
- **SC-003**: Users can update an edge's label or style and see the change reflected on the board immediately after confirmation.
- **SC-004**: Users can delete an edge and have it disappear from the board view immediately, with no trace in subsequent board loads.
- **SC-005**: Zero ghost or orphan edges remain visible after any failed connection attempt or rollback.
- **SC-006**: Every successful edge mutation increments the board revision exactly once and records an auditable operation entry.
- **SC-007**: During a connection drag, valid and invalid targets are visually distinguishable within the time it takes the user to move the cursor over them (instantaneous feedback).
- **SC-008**: When a node is deleted, all of its connected edges disappear from the board in the same operation, with a single revision increment.

## Assumptions

- Duplicate edges between the same pair of nodes are allowed in MVP. There is no uniqueness constraint on (source, target) pairs.
- Edge direction is meaningful (source → target), but the visual representation of directionality (arrowheads, etc.) is a style concern handled by the edge's style properties.
- The connection handle interaction (drag from source to target) is the primary mechanism for creating edges in MVP. An alternative "select two nodes and connect" flow may be added later but is not required.
- Edge label is optional and may be empty or null.
- Style and metadata are freeform property bags with no prescribed schema in MVP.
- Edge endpoints (source and target node) are immutable after creation. To re-point an edge, users delete the existing edge and create a new one.
- Board archival rules and node CRUD behavior are defined by their respective features and are treated as dependencies, not re-specified here.

## Scope Exclusions

- Node CRUD details (except what edge validation requires about active-node and same-board checks)
- Asset management
- Batch mutation endpoint
- Chat and agent flows
- Operations polling
- Advanced edge routing or layout algorithms
