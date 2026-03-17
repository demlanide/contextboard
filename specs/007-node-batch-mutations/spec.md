# Feature Specification: Node Batch Mutations

**Feature Branch**: `007-node-batch-mutations`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Atomic batch node mutations — POST /boards/{boardId}/nodes/batch with ordered create/update/delete, temp-id mapping, rollback on failure, revision behavior, frontend grouped-action support, and reconciliation from returned batch diff"

## Clarifications

### Session 2026-03-16

- Q: Should the batch response `deleted` array include only explicitly targeted node IDs, or also cascade-deleted edge IDs? → A: Include both node IDs and cascade-deleted edge IDs, distinguished by an entity type field.
- Q: Should `created` and `updated` arrays contain full node objects, just IDs, or partial diffs? → A: Full node objects (same shape as single-node responses), with temp-ID-to-real-ID mapping on created entries.
- Q: If a batch delete targets a node already soft-deleted before the batch, should it fail the batch or be a no-op? → A: Fail the entire batch (node not found / not active is a validation error).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Multi-Node Rearrange (Priority: P1)

A user selects several nodes on the board and drags them to new positions. Instead of sending one request per node, the browser submits all position changes as a single batch. Either every node moves or none do, so the board never shows a half-moved layout.

**Why this priority**: Moving multiple nodes at once is the most frequent multi-node action on a canvas tool. Without batch support the UI must serialize individual patches, creating partial-update risk and sluggish feedback.

**Independent Test**: Can be fully tested by selecting 3+ nodes, dragging the group, and verifying that the board reflects all new positions after one server round-trip — or reverts entirely on failure.

**Acceptance Scenarios**:

1. **Given** a board with 5 nodes at known positions, **When** the user submits a batch of 5 update operations changing x/y for each, **Then** the server returns all 5 updated nodes and increments the board revision exactly once.
2. **Given** a board with 5 nodes, **When** a batch of 5 update operations is submitted and one references a non-existent node, **Then** the server rejects the entire batch, no node positions change, and the board revision does not increment.
3. **Given** a board with 3 nodes, **When** a batch of 3 position updates succeeds, **Then** a subsequent board state hydration shows all 3 nodes at their new positions.

---

### User Story 2 — Batch Create Multiple Nodes (Priority: P1)

A user triggers an action that creates several nodes at once — for example, pasting multiple items or using a "generate ideas" shortcut. The browser sends all creations in one batch with client-assigned temporary IDs. The response maps each temp ID to a real server-assigned ID so the UI can reconcile immediately.

**Why this priority**: Batch creation is required for any multi-node generation flow, including future agent-apply scenarios. Temp-ID mapping is foundational for referencing newly created entities within the same batch.

**Independent Test**: Can be tested by submitting a batch with 3 create operations using temp IDs and verifying the response contains a mapping from each temp ID to a real UUID, plus valid created node objects.

**Acceptance Scenarios**:

1. **Given** an active board, **When** a batch containing 3 create operations with temp IDs `tmp-1`, `tmp-2`, `tmp-3` is submitted, **Then** the response `created` array contains 3 full node objects, each with a server-assigned real UUID and the originating `tempId` field preserved for mapping.
2. **Given** an active board, **When** a batch containing a create operation with invalid node data (e.g., missing required content for the node type), **Then** the entire batch fails, no nodes are created, and the board revision does not increment.
3. **Given** an active board, **When** a batch containing a create operation references an image asset that does not exist, **Then** the entire batch is rejected with a validation error.

---

### User Story 3 — Batch Delete Multiple Nodes (Priority: P2)

A user selects several nodes and deletes them all at once. The batch ensures that all nodes (and their connected edges) are soft-deleted atomically in a single transaction.

**Why this priority**: Multi-delete is less frequent than move or create, but must still be atomic to prevent a partially deleted board state. Connected-edge cascade within a batch makes this non-trivial.

**Independent Test**: Can be tested by creating a board with nodes and edges, submitting a batch delete of 2+ nodes, and verifying that all targeted nodes and their connected edges disappear from the board state.

**Acceptance Scenarios**:

1. **Given** a board with 3 nodes and 2 edges connecting them, **When** a batch of 2 delete operations removes 2 nodes, **Then** both nodes and all edges connected to them are soft-deleted, the response `deleted` array lists all affected node and edge IDs (each entry distinguished by entity type), and the board revision increments once.
2. **Given** a board with a locked node, **When** a batch includes a delete operation targeting the locked node, **Then** the entire batch fails and no nodes or edges are deleted.

---

### User Story 4 — Mixed Batch Operations (Priority: P2)

A user performs a complex board action that creates, updates, and deletes nodes in one step — for example, replacing a cluster of nodes with a reorganized set. The batch processes operations in the submitted order so that later operations can depend on earlier ones (e.g., an update referencing a temp ID from an earlier create).

**Why this priority**: Mixed batches unlock the full power of atomic board mutations and are the foundation the agent-apply flow will reuse. Order-dependent operations with temp-ID resolution are the hardest correctness requirement.

**Independent Test**: Can be tested by submitting a batch that creates a node (with temp ID), then updates that same node (referencing the temp ID), then deletes a different existing node, and verifying all three outcomes in one response.

**Acceptance Scenarios**:

1. **Given** an active board with node A, **When** a batch containing [create node B with tmp-1, update tmp-1 position, delete node A] is submitted, **Then** node B is created and updated, node A is deleted with its edges, the response reflects all three outcomes, and the board revision increments once.
2. **Given** an active board, **When** a batch contains a create then an update referencing a temp ID from that create, **Then** the update is applied to the newly created node using the resolved real ID.
3. **Given** an active board, **When** a batch contains an update referencing a temp ID that was never created in the batch, **Then** the entire batch fails with a validation error.

---

### User Story 5 — Frontend Grouped-Action Feedback (Priority: P2)

When the user triggers a grouped action (multi-select move, multi-delete, paste-many), the UI shows a pending state for all affected items, then reconciles from the server-returned batch diff on success or rolls back all items to their prior confirmed positions on failure.

**Why this priority**: Without clear pending and rollback UX, the user cannot tell whether a grouped action succeeded, partially applied, or failed. This story ensures the frontend never displays an ambiguous intermediate state.

**Independent Test**: Can be tested by triggering a batch action, observing pending indicators on all affected nodes, and verifying that on success the nodes update to server-confirmed state, or on failure they revert to pre-action state.

**Acceptance Scenarios**:

1. **Given** the user selects 4 nodes and moves them, **When** the batch request is in flight, **Then** all 4 nodes show a pending/saving indicator in the UI.
2. **Given** the user moves 4 nodes as a batch, **When** the server responds with the updated diff, **Then** the frontend replaces local positions with server-confirmed positions for all 4 nodes and updates the board revision.
3. **Given** the user moves 4 nodes as a batch, **When** the server rejects the batch, **Then** all 4 nodes revert to their pre-move confirmed positions and an error is displayed.

---

### Edge Cases

- What happens when a batch contains 0 operations? The system rejects it with a validation error.
- What happens when a batch contains exactly 200 operations? It is accepted and processed normally.
- What happens when a batch contains 201 operations? It is rejected with a validation error.
- What happens when a later batch operation references a node that an earlier operation in the same batch soft-deleted? The entire batch fails because the later operation targets a deleted entity.
- What happens when two concurrent batch requests target the same board? They are serialized via per-board advisory lock; one succeeds first, and the second is validated against the state left by the first.
- What happens when the user submits a batch on an archived board? The batch is rejected because the board is not editable.
- What happens when temp IDs collide (same temp ID used for two creates in one batch)? The batch is rejected with a validation error for duplicate temp IDs.
- What happens when a batch delete targets a node that was already soft-deleted before the batch? The system treats this as a validation error (node not active) and fails the entire batch.
- What happens if the batch request times out but the server committed? The client should check board state via hydration to reconcile; idempotency keys prevent duplicate commits on retry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a batch of node mutation operations (create, update, delete) in a single request to `POST /boards/{boardId}/nodes/batch`.
- **FR-002**: System MUST execute batch operations in the order they are submitted.
- **FR-003**: System MUST treat the entire batch as an atomic transaction — either all operations succeed and are committed, or none are.
- **FR-004**: System MUST increment the board revision exactly once for a successfully committed batch, regardless of how many operations it contains.
- **FR-005**: System MUST write operation log entries for every durable change in the batch, all sharing the same board revision and batch ID.
- **FR-006**: System MUST support client-assigned temporary IDs (`tempId`) on create operations and return a mapping of each temp ID to the server-assigned real ID in the response.
- **FR-007**: System MUST allow later operations in the same batch to reference temp IDs from earlier create operations (e.g., updating a node just created in the same batch).
- **FR-008**: System MUST reject the entire batch if any single operation fails validation — including schema errors, missing references, locked-node conflicts, already-deleted targets, or domain rule violations. A delete or update targeting a node that is already soft-deleted (prior to the batch) is a validation error.
- **FR-009**: System MUST reject batches exceeding 200 operations with a validation error.
- **FR-010**: System MUST reject batches with 0 operations with a validation error.
- **FR-011**: System MUST reject batches containing duplicate temp IDs with a validation error.
- **FR-012**: System MUST soft-delete connected edges when a batch delete operation removes a node, within the same transaction.
- **FR-013**: System MUST reject batch operations targeting locked nodes with a `409 LOCKED_NODE` error, failing the entire batch.
- **FR-014**: System MUST reject batch requests on non-editable boards (archived or deleted) with the appropriate error.
- **FR-015**: System MUST return a response containing `created`, `updated`, and `deleted` arrays, plus the new `boardRevision`, so the client can reconcile confirmed state from the response diff. The `created` and `updated` arrays MUST contain full node objects (same shape as single-node create/update responses). Created entries MUST include a `tempId` field mapping the client temp ID to the server-assigned real ID. The `deleted` array MUST include both explicitly targeted node IDs and cascade-deleted edge IDs, each entry distinguished by an entity type field (e.g., `node` or `edge`).
- **FR-016**: System MUST support idempotency keys for batch requests so that a retried batch with the same key and payload returns the original response without re-executing.
- **FR-017**: Frontend MUST submit grouped node actions (multi-select move, multi-delete, multi-create) as a single batch request where the UI groups them.
- **FR-018**: Frontend MUST show pending state for all nodes affected by an in-flight batch request.
- **FR-019**: Frontend MUST reconcile confirmed board state from the server-returned batch diff on success — not from local inference.
- **FR-020**: Frontend MUST roll back all affected nodes to their pre-action confirmed state when a batch request fails.
- **FR-021**: Frontend MUST update the local board revision from the batch response.
- **FR-022**: System MUST serialize concurrent batch requests targeting the same board to maintain revision monotonicity and prevent partial-ordering conflicts.

### Key Entities

- **Batch Request**: A collection of ordered node mutation operations submitted atomically. Contains an array of operation items, each typed as `create`, `update`, or `delete`.
- **Batch Operation Item**: A single instruction within a batch — either a create (with temp ID and node payload), an update (with real or temp node ID and patch payload), or a delete (with real node ID).
- **Temp ID**: A client-assigned identifier (string, prefixed `tmp-`) used to reference a node created earlier in the same batch before its real server ID exists.
- **Batch Response Diff**: The canonical server result containing `created`, `updated`, and `deleted` arrays plus the new `boardRevision`. This is the single source of truth the client uses for reconciliation. Each entry in `deleted` carries an entity type field (`node` or `edge`) so the frontend can remove both explicitly deleted nodes and cascade-deleted edges from its store.
- **Batch ID**: A server-assigned UUID grouping all operation log entries for one committed batch.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A batch of up to 200 node operations completes within 2 seconds under normal board conditions (fewer than 1,000 existing nodes).
- **SC-002**: 100% of failed batch requests leave the board in an unchanged state — no partial creates, updates, or deletes persist.
- **SC-003**: Every temp ID in a batch create operation resolves to a unique, deterministic real ID in the response.
- **SC-004**: The board revision increments exactly once per successful batch, regardless of the number of operations.
- **SC-005**: Users can move, create, or delete multiple nodes at once without ever seeing an inconsistent intermediate board state.
- **SC-006**: When a batch fails, all affected nodes visibly revert to their confirmed pre-action state within 1 second.
- **SC-007**: Grouped node actions in the browser produce at most one network request per user-initiated action (not one per node).

## Assumptions

- The existing single-node mutation endpoints (create, update, delete) remain available and unchanged. The batch endpoint is an additional capability, not a replacement.
- Batch operations are node-only in this slice. Edge batch mutations are out of scope (edges are only affected as a side effect of node deletion cascades).
- The agent-apply flow (S10) will reuse the same internal batch mutation helpers but is not part of this feature's scope.
- The per-board advisory lock mechanism established in S3 (revision + operations foundation) is available and functional.
- Frontend store already has the normalized confirmed-state structure from S3.5/S4 that supports diff-based reconciliation.
- Idempotency infrastructure from earlier slices is available for reuse.
