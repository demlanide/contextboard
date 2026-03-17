# API Contracts: Edge Endpoints

**Feature Branch**: `006-edge-crud`
**Date**: 2026-03-16

All contracts below match the existing OpenAPI spec (`documentation/openapi.yaml`).

---

## POST /api/boards/:boardId/edges

Create an edge between two nodes on the specified board.

### Request

**Content-Type**: `application/json`
**Headers**: `Idempotency-Key` (optional)

```json
{
  "sourceNodeId": "550e8400-e29b-41d4-a716-446655440001",
  "targetNodeId": "550e8400-e29b-41d4-a716-446655440002",
  "label": "leads to",
  "style": {},
  "metadata": {}
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| sourceNodeId | string (uuid) | yes | Must exist, active, same board |
| targetNodeId | string (uuid) | yes | Must exist, active, same board, ≠ sourceNodeId |
| label | string \| null | no | Max 1,000 characters |
| style | object | no | Defaults to {} |
| metadata | object | no | Defaults to {} |

### Response — 201 Created

```json
{
  "data": {
    "edge": {
      "id": "660e8400-e29b-41d4-a716-446655440099",
      "boardId": "770e8400-e29b-41d4-a716-446655440000",
      "sourceNodeId": "550e8400-e29b-41d4-a716-446655440001",
      "targetNodeId": "550e8400-e29b-41d4-a716-446655440002",
      "label": "leads to",
      "style": {},
      "metadata": {},
      "createdAt": "2026-03-16T12:00:00.000Z",
      "updatedAt": "2026-03-16T12:00:00.000Z"
    },
    "boardRevision": 5
  },
  "error": null
}
```

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | BOARD_NOT_FOUND | Board does not exist or is deleted |
| 422 | VALIDATION_ERROR | Request body fails schema validation |
| 422 | VALIDATION_ERROR | Board is archived |
| 422 | INVALID_EDGE_REFERENCE | Source or target node does not exist |
| 422 | INVALID_EDGE_REFERENCE | Source or target node is soft-deleted |
| 422 | INVALID_EDGE_REFERENCE | Source or target node belongs to a different board |
| 422 | VALIDATION_ERROR | source_node_id = target_node_id (self-loop) |

---

## PATCH /api/edges/:edgeId

Partial update of an edge's mutable properties.

### Request

**Content-Type**: `application/merge-patch+json`
**Headers**: `Idempotency-Key` (optional)

```json
{
  "label": "depends on",
  "style": {
    "lineStyle": "dashed"
  }
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| label | string \| null | no | Max 1,000 characters; null clears label |
| style | object | no | Merge-patched with existing |
| metadata | object | no | Merge-patched with existing |

**Immutable fields**: `sourceNodeId`, `targetNodeId` are not accepted. Submitting them returns 422.

### Response — 200 OK

```json
{
  "data": {
    "edge": {
      "id": "660e8400-e29b-41d4-a716-446655440099",
      "boardId": "770e8400-e29b-41d4-a716-446655440000",
      "sourceNodeId": "550e8400-e29b-41d4-a716-446655440001",
      "targetNodeId": "550e8400-e29b-41d4-a716-446655440002",
      "label": "depends on",
      "style": { "lineStyle": "dashed" },
      "metadata": {},
      "createdAt": "2026-03-16T12:00:00.000Z",
      "updatedAt": "2026-03-16T12:05:00.000Z"
    },
    "boardRevision": 6
  },
  "error": null
}
```

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | EDGE_NOT_FOUND | Edge does not exist or is soft-deleted |
| 415 | UNSUPPORTED_MEDIA_TYPE | Content-Type is not application/merge-patch+json |
| 422 | VALIDATION_ERROR | Request body fails schema validation |
| 422 | VALIDATION_ERROR | Board is archived |

---

## DELETE /api/edges/:edgeId

Soft-delete an edge.

### Request

No request body.

### Response — 200 OK

```json
{
  "data": {
    "success": true,
    "deletedEdgeId": "660e8400-e29b-41d4-a716-446655440099",
    "boardRevision": 7
  },
  "error": null
}
```

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | EDGE_NOT_FOUND | Edge does not exist or is soft-deleted |
| 422 | VALIDATION_ERROR | Board is archived |

---

## Common Response Envelope

All responses follow the standard success/error envelope:

```typescript
interface SuccessResponse<T> {
  data: T;
  error: null;
}

interface ErrorResponse {
  data: null;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}
```

## Idempotency

- `POST /api/boards/:boardId/edges` supports the `Idempotency-Key` header via the existing `idempotencyMiddleware('create_edge')`.
- `PATCH /api/edges/:edgeId` supports the `Idempotency-Key` header via `idempotencyMiddleware('update_edge')`.
- `DELETE /api/edges/:edgeId` is naturally idempotent (deleting an already-deleted edge returns 404).
