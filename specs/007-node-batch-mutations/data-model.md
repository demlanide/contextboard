# Data Model: Node Batch Mutations

**Feature**: 007-node-batch-mutations
**Date**: 2026-03-16

## Overview

The batch node mutations feature does not introduce new database tables or schema changes. It reuses the existing `board_nodes`, `board_edges`, `board_operations`, and `boards` tables from prior slices. The batch endpoint operates on existing entities through the same repos and transaction infrastructure.

## Entities Used

### Batch Request (transient — not persisted)

| Field | Type | Description |
|-------|------|-------------|
| operations | Array\<BatchOperationItem\> | Ordered list of create/update/delete items |

Validation:
- `operations.length >= 1` and `<= 200` (from `config/limits.ts`)
- No duplicate `tempId` values across create operations
- Each item validates per its type (see below)

### BatchOperationItem — Create

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"create"` | Yes | Operation type discriminator |
| tempId | string | Yes | Client-assigned temp ID, must be unique within batch |
| node | CreateNodeRequest | Yes | Same schema as single-node create (type, x, y, width, height, content, style, metadata) |

### BatchOperationItem — Update

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"update"` | Yes | Operation type discriminator |
| nodeId | string (UUID or temp ID) | Yes | Target node; may reference a temp ID from an earlier create in the same batch |
| changes | UpdateNodeRequest | Yes | Same merge-patch schema as single-node update |

### BatchOperationItem — Delete

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"delete"` | Yes | Operation type discriminator |
| nodeId | string (UUID) | Yes | Target node ID; must be a real UUID (temp IDs for delete not supported — cannot delete a node that only exists as a create in this batch; that would be a contradictory sequence) |

### Batch Response Diff (transient — returned in HTTP response)

| Field | Type | Description |
|-------|------|-------------|
| batchId | UUID | Server-assigned batch identifier; shared by all operation log entries |
| boardRevision | number | New board revision after successful batch |
| created | Node[] | Full node objects for each created node; each includes a `tempId` field |
| updated | Node[] | Full node objects reflecting post-update state |
| deleted | Array\<{ id: string, type: "node" \| "edge" }\> | Explicitly deleted nodes + cascade-deleted edges |

### Batch ID in Operations Log

Each operation log entry for a committed batch shares the same `batch_id` UUID. This groups all operation rows from one batch for audit and debugging.

The existing `board_operations.batch_id` column (nullable UUID, already present from S3) is used. No schema change required.

## State Transitions

### Within a Batch Transaction

```text
batch received
  → validate batch structure (size, duplicates, item schemas)
  → withBoardMutation(boardId):
      → acquire advisory lock
      → assert board exists + editable
      → for each operation in order:
          create → validate content → insertNode → register tempId
          update → resolve tempId if needed → load node → assert active + unlocked → applyMergePatch → updateNode
          delete → load node → assert active + unlocked → softDeleteNode → softDeleteByNodeId (edges)
      → bump revision once
      → write all operation entries with shared batchId + revision
      → commit
  → return diff
```

### Frontend Store Transitions

```text
user triggers grouped action
  → snapshot all affected nodes
  → apply optimistic changes to all (positions, removals)
  → set batch mutation status = 'pending' for all affected IDs
  → submit batch request
  → on success:
      → reconcile created/updated/deleted from server diff
      → update boardRevision from response
      → clear pending status
  → on failure:
      → restore all affected nodes from snapshot
      → set batch mutation status = 'failed'
      → display error
```

## Existing Tables Used (no changes)

| Table | Usage |
|-------|-------|
| `boards` | Read board for editability check + revision bump |
| `board_nodes` | Insert, update, soft-delete nodes |
| `board_edges` | Cascade soft-delete on node deletion |
| `board_operations` | Append operation entries with shared `batch_id` and `board_revision` |
| `idempotency_keys` | Batch endpoint participates in existing idempotency middleware |

## Validation Rules (per-item, within transaction)

| Rule | Layer | Error |
|------|-------|-------|
| Board exists | Domain | 404 BOARD_NOT_FOUND |
| Board editable | Domain | 409 BOARD_ARCHIVED |
| Batch size 1–200 | Request schema | 422 VALIDATION_ERROR |
| No duplicate temp IDs | Request/Domain | 422 VALIDATION_ERROR |
| Operation type valid | Request schema | 422 VALIDATION_ERROR |
| Node content valid for type | Domain | 422 VALIDATION_ERROR |
| Target node exists + active | Transaction-time | 422 VALIDATION_ERROR |
| Target node not locked | Transaction-time | 409 LOCKED_NODE |
| Temp ID resolvable | Transaction-time | 422 VALIDATION_ERROR |
| Image asset exists | Transaction-time | 422 VALIDATION_ERROR |
