# Research: Node Batch Mutations

**Feature**: 007-node-batch-mutations
**Date**: 2026-03-16

## Overview

No NEEDS CLARIFICATION items were identified in the Technical Context. All technology choices, infrastructure, and patterns are established from prior slices (S3 revision/operations, S4 node CRUD, S3.5 frontend foundation). This research documents the key design decisions and their rationale.

## Decision 1: Batch Transaction Strategy

**Decision**: Reuse `withBoardMutation` for the entire batch — one transaction, one advisory lock, one revision bump.

**Rationale**: The existing `withBoardMutation` in `db/tx.ts` already handles `BEGIN`, board advisory lock, board existence/editability check, revision bump, operation log insertion, and `COMMIT`/`ROLLBACK`. Wrapping the full batch in a single call to this function provides atomicity, revision monotonicity, and operation log consistency with zero new infrastructure.

**Alternatives considered**:
- *Separate transaction per item*: Rejected — violates all-or-nothing atomicity requirement (FR-003) and would produce multiple revision bumps (violates FR-004).
- *Custom transaction wrapper for batch*: Rejected — unnecessary duplication of `withBoardMutation` logic that already handles all required concerns.

## Decision 2: In-Transaction Node Mutation Helpers

**Decision**: Extract the core insert/update/delete logic from `nodes.service.ts` into reusable in-transaction helper functions (`createNodeInTx`, `updateNodeInTx`, `deleteNodeInTx`) that accept a `PoolClient` and skip the outer `withBoardMutation` wrapper.

**Rationale**: The current `nodes.service.ts` functions each open their own `withBoardMutation` transaction. For batch execution, all operations must share one transaction. Extracting the inner logic as helpers allows both single-node endpoints and the batch service to use the same validated mutation path, as mandated by the architecture document ("reuse the same in-transaction mutation helpers for user edits, batch edits, and agent apply").

**Alternatives considered**:
- *Duplicate validation/mutation logic in batch service*: Rejected — creates a second mutation path, which the architecture doc and Constitution Principle IV explicitly prohibit.
- *Call existing service functions sequentially outside a transaction*: Rejected — each would open its own transaction, breaking atomicity.

## Decision 3: Temp-ID Resolution Strategy

**Decision**: Maintain a `TempIdMap` (simple `Map<string, string>`) within the batch execution scope. Before executing each operation, resolve any temp ID references through the map. After a create operation, register the mapping from temp ID to real UUID.

**Rationale**: Temp IDs are scoped to one batch request and need no persistence. A simple in-memory map handles all resolution needs. Validating uniqueness upfront (FR-011) and checking forward references per-operation (FR-007) are straightforward map lookups.

**Alternatives considered**:
- *Database-persisted temp-ID table*: Rejected — massive overkill for request-scoped mapping.
- *Client resolves IDs after first response*: Rejected — would require multiple round-trips and break single-request atomicity.

## Decision 4: Batch Response Shape

**Decision**: Return `{ batchId, boardRevision, created: Node[], updated: Node[], deleted: Array<{ id, type }> }` where `created` entries include a `tempId` field, and `deleted` entries carry an entity type (`node` or `edge`).

**Rationale**: Clarified in spec session — full node objects in `created`/`updated` let the frontend reconcile in one step without rehydrating. Entity type on `deleted` entries lets the frontend remove cascade-deleted edges. This matches the existing single-node response pattern where create/update return full objects and delete returns IDs.

**Alternatives considered**:
- *Return only IDs in created/updated*: Rejected — forces frontend to rehydrate, adding latency and complexity.
- *Separate cascadedEdges array*: Rejected — less consistent than a typed `deleted` array.

## Decision 5: Frontend Batch Store Actions

**Decision**: Add batch-specific store actions (`batchMoveOptimistic`, `batchDeleteOptimistic`, `reconcileBatch`, `rollbackBatch`) alongside existing single-node actions. These operate on arrays of node IDs and manage pending/confirmed state in bulk.

**Rationale**: Existing single-node actions (`updateNodeOptimistic`, `confirmNodeUpdate`, `rollbackNodeUpdate`) work on one node at a time. Batch actions need to snapshot multiple nodes, apply optimistic changes to all, and rollback/reconcile all as a unit. Separate actions keep the store clean and allow the UI to show a consistent pending state across the group.

**Alternatives considered**:
- *Loop over existing single-node actions*: Rejected — produces multiple intermediate store updates, flickers, and cannot atomically rollback all nodes as a group.
- *Replace single-node actions with batch-only*: Rejected — single-node mutations are still used independently; batch is an addition, not a replacement.

## Decision 6: Multi-Select Drag Batching

**Decision**: When the user drags a multi-selection and releases, `useNodeDrag` collects all affected node IDs and their new positions, then calls `useBatchNodeMutations.batchMoveNodes()` which submits a single batch update request.

**Rationale**: This is the most common batch scenario (User Story 1). The existing `useNodeDrag` hook handles single-node drag; extending it to collect multi-selection positions on release and delegate to the batch hook is a minimal change that consolidates the network call.

**Alternatives considered**:
- *Parallel individual PATCH requests*: Rejected — non-atomic, produces multiple revision bumps, and creates partial-move risk.
- *Debounced batch during drag*: Rejected — introduces unnecessary complexity for MVP; commit-on-release is simpler and correct.
