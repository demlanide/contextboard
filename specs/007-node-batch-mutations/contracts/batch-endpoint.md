# API Contract: Batch Node Mutations

**Feature**: 007-node-batch-mutations
**Date**: 2026-03-16

## POST /api/boards/:boardId/nodes/batch

Atomically execute an ordered batch of node create/update/delete operations.

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | `application/json` |
| Idempotency-Key | Recommended | Client-generated key for safe retry |

### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| boardId | UUID | Target board |

### Request Body

```json
{
  "operations": [
    {
      "type": "create",
      "tempId": "tmp-1",
      "node": {
        "type": "sticky",
        "x": 100,
        "y": 100,
        "width": 240,
        "height": 120,
        "content": { "text": "Theme A" },
        "style": {},
        "metadata": { "aiGenerated": false }
      }
    },
    {
      "type": "update",
      "nodeId": "tmp-1",
      "changes": {
        "x": 320,
        "y": 100
      }
    },
    {
      "type": "update",
      "nodeId": "existing-uuid-1",
      "changes": {
        "x": 500,
        "y": 200
      }
    },
    {
      "type": "delete",
      "nodeId": "existing-uuid-2"
    }
  ]
}
```

### Request Validation

| Rule | Error |
|------|-------|
| `operations` array present and non-empty | 422 VALIDATION_ERROR |
| `operations.length <= 200` | 422 VALIDATION_ERROR |
| Each item has valid `type` (`create`, `update`, `delete`) | 422 VALIDATION_ERROR |
| Create items have `tempId` (string) and `node` (valid CreateNodeRequest) | 422 VALIDATION_ERROR |
| Update items have `nodeId` (string) and `changes` (valid UpdateNodeRequest) | 422 VALIDATION_ERROR |
| Delete items have `nodeId` (UUID string) | 422 VALIDATION_ERROR |
| No duplicate `tempId` values across create operations | 422 VALIDATION_ERROR |

### Success Response

**Status**: `200 OK`

```json
{
  "data": {
    "batchId": "batch-uuid",
    "boardRevision": 14,
    "created": [
      {
        "tempId": "tmp-1",
        "id": "real-uuid-1",
        "boardId": "board-uuid",
        "type": "sticky",
        "parentId": null,
        "x": 320,
        "y": 100,
        "width": 240,
        "height": 120,
        "rotation": 0,
        "zIndex": 0,
        "content": { "text": "Theme A" },
        "style": {},
        "metadata": { "aiGenerated": false },
        "locked": false,
        "hidden": false,
        "createdAt": "2026-03-16T14:00:00.000Z",
        "updatedAt": "2026-03-16T14:00:00.000Z"
      }
    ],
    "updated": [
      {
        "id": "existing-uuid-1",
        "boardId": "board-uuid",
        "type": "text",
        "parentId": null,
        "x": 500,
        "y": 200,
        "width": 240,
        "height": 160,
        "rotation": 0,
        "zIndex": 1,
        "content": { "text": "Some text" },
        "style": {},
        "metadata": {},
        "locked": false,
        "hidden": false,
        "createdAt": "2026-03-16T13:00:00.000Z",
        "updatedAt": "2026-03-16T14:00:00.000Z"
      }
    ],
    "deleted": [
      { "id": "existing-uuid-2", "type": "node" },
      { "id": "edge-uuid-1", "type": "edge" },
      { "id": "edge-uuid-2", "type": "edge" }
    ]
  },
  "error": null
}
```

### Notes on Response Shape

- **`created`**: Full node objects (same shape as single-node `POST /boards/:boardId/nodes` response). Each includes the originating `tempId` for client-side mapping.
- **`updated`**: Full node objects reflecting post-update state (same shape as single-node `PATCH /nodes/:nodeId` response).
- **`deleted`**: Array of `{ id, type }` entries. `type` is `"node"` for explicitly deleted nodes and `"edge"` for cascade-deleted edges.
- **`boardRevision`**: The single new revision for the entire batch.
- **`batchId`**: Server-assigned UUID grouping all operation log entries.

### Error Responses

| Condition | Status | Code | Details |
|-----------|--------|------|---------|
| Board not found | 404 | BOARD_NOT_FOUND | `{ boardId }` |
| Board archived | 409 | BOARD_ARCHIVED | `{ boardId }` |
| Board deleted | 404 | BOARD_NOT_FOUND | `{ boardId }` |
| Empty operations array | 422 | VALIDATION_ERROR | `{ field: "operations", reason: "must not be empty" }` |
| Too many operations (>200) | 422 | VALIDATION_ERROR | `{ field: "operations", reason: "exceeds maximum of 200", count }` |
| Duplicate temp IDs | 422 | VALIDATION_ERROR | `{ field: "operations", reason: "duplicate tempId", tempId }` |
| Invalid operation type | 422 | VALIDATION_ERROR | `{ field: "operations[i].type", reason: "unsupported operation type" }` |
| Invalid node content | 422 | VALIDATION_ERROR | `{ field: "operations[i].node.content", reason }` |
| Node not found / not active | 422 | VALIDATION_ERROR | `{ field: "operations[i].nodeId", reason: "node not found or not active", nodeId }` |
| Node locked | 409 | LOCKED_NODE | `{ nodeId }` |
| Unresolvable temp ID | 422 | VALIDATION_ERROR | `{ field: "operations[i].nodeId", reason: "temp ID not found in batch", tempId }` |
| Missing image asset | 422 | VALIDATION_ERROR | `{ field: "operations[i].node.content.assetId", reason: "asset not found" }` |
| Idempotency key conflict | 409 | IDEMPOTENCY_CONFLICT | `{ idempotencyKey }` |

### Operation Sequencing Rules

1. Operations are executed in array order.
2. A create operation registers its `tempId → realId` mapping immediately after insertion.
3. Subsequent update/delete operations may reference a `tempId` from an earlier create; the system resolves it to the real UUID before executing.
4. A delete operation targeting a node created earlier in the same batch deletes the just-created node.
5. An update operation targeting a node deleted earlier in the same batch fails the entire batch (node is no longer active).
6. A delete operation targeting a node already soft-deleted before the batch was submitted fails the entire batch.

### Idempotency

- The batch endpoint supports `Idempotency-Key` header via existing middleware.
- Same key + same payload = returns cached original response.
- Same key + different payload = `409 IDEMPOTENCY_CONFLICT`.

### Test Matrix Coverage

This endpoint is covered by existing test-matrix cases:
- T024: Batch create+update (happy path)
- T025: Batch rollback on invalid op
- T026: Batch >200 ops rejected
- T027: Batch tempIds mapping
