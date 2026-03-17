# API Contracts: Node CRUD Endpoints

**Feature**: `005-node-crud` | **Date**: 2026-03-16

These contracts are derived from the existing OpenAPI specification (`documentation/openapi.yaml`). The OpenAPI spec is the authoritative source; this document provides implementation-facing detail.

---

## POST /boards/{boardId}/nodes — Create Node

### Request

**Content-Type**: `application/json`

**Headers**:
- `Idempotency-Key` (optional): UUID for idempotent retries

**Path Parameters**:
- `boardId`: UUID

**Body** (`CreateNodeRequest`):

```json
{
  "type": "sticky",
  "x": 100,
  "y": 200,
  "width": 200,
  "height": 120,
  "content": { "text": "Hello world" },
  "rotation": 0,
  "zIndex": 0,
  "style": { "backgroundColor": "#FFEB3B" },
  "metadata": {}
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `type` | enum | Yes | sticky, text, image, shape |
| `x` | number | Yes | any finite number |
| `y` | number | Yes | any finite number |
| `width` | number | Yes | > 0, ≤ 10000 |
| `height` | number | Yes | > 0, ≤ 10000 |
| `content` | object | Yes | per-type rules |
| `parentId` | uuid \| null | No | valid UUID or null |
| `rotation` | number | No | default 0 |
| `zIndex` | integer | No | default 0 |
| `style` | object | No | default {} |
| `metadata` | object | No | default {} |

### Response — 201 Created

**Body** (`NodeResponse`):

```json
{
  "data": {
    "node": {
      "id": "a1b2c3d4-...",
      "boardId": "e5f6g7h8-...",
      "type": "sticky",
      "parentId": null,
      "x": 100,
      "y": 200,
      "width": 200,
      "height": 120,
      "rotation": 0,
      "zIndex": 0,
      "content": { "text": "Hello world" },
      "style": { "backgroundColor": "#FFEB3B" },
      "metadata": {},
      "locked": false,
      "hidden": false,
      "createdAt": "2026-03-16T10:00:00.000Z",
      "updatedAt": "2026-03-16T10:00:00.000Z"
    },
    "boardRevision": 5
  },
  "error": null
}
```

**Note**: The existing OpenAPI `NodeResponse` does not include `boardRevision` in the data envelope. This implementation MUST add `boardRevision` to the create and update responses so the frontend can update its sync token. This is a non-breaking additive change to the envelope. The OpenAPI spec should be updated in the same changeset.

### Error Responses

| Status | When |
|--------|------|
| 404 | Board not found or deleted |
| 409 | Board is archived (not editable) |
| 422 | Validation failure (invalid type, content, geometry) |

---

## PATCH /nodes/{nodeId} — Update Node

### Request

**Content-Type**: `application/merge-patch+json`

**Headers**:
- `Idempotency-Key` (optional): UUID for idempotent retries

**Path Parameters**:
- `nodeId`: UUID

**Body** (`UpdateNodeRequest`):

```json
{
  "x": 300,
  "y": 400,
  "content": { "text": "Updated text" },
  "style": { "backgroundColor": "#4CAF50" }
}
```

All fields are optional. Merge-patch semantics apply:
- Present scalar: overwrite
- Present object: recursive merge
- `null` value: remove key
- Absent key: no change

| Field | Type | Notes |
|-------|------|-------|
| `x` | number | |
| `y` | number | |
| `width` | number | > 0, ≤ 10000 |
| `height` | number | > 0, ≤ 10000 |
| `rotation` | number | |
| `zIndex` | integer | |
| `content` | object | merged with existing; result validated per type |
| `style` | object | merged with existing |
| `metadata` | object | merged with existing |
| `parentId` | uuid \| null | |
| `locked` | boolean | |
| `hidden` | boolean | |

### Response — 200 OK

**Body** (`NodeResponse`):

```json
{
  "data": {
    "node": {
      "id": "a1b2c3d4-...",
      "boardId": "e5f6g7h8-...",
      "type": "sticky",
      "parentId": null,
      "x": 300,
      "y": 400,
      "width": 200,
      "height": 120,
      "rotation": 0,
      "zIndex": 0,
      "content": { "text": "Updated text" },
      "style": { "backgroundColor": "#4CAF50" },
      "metadata": {},
      "locked": false,
      "hidden": false,
      "createdAt": "2026-03-16T10:00:00.000Z",
      "updatedAt": "2026-03-16T10:05:00.000Z"
    },
    "boardRevision": 6
  },
  "error": null
}
```

### Error Responses

| Status | When |
|--------|------|
| 404 | Node not found or soft-deleted |
| 409 | Node is locked; or board is archived |
| 415 | Content-Type is not `application/merge-patch+json` |
| 422 | Validation failure (geometry out of bounds, content invalid after merge) |

---

## DELETE /nodes/{nodeId} — Soft-Delete Node

### Request

**Content-Type**: none (no body)

**Path Parameters**:
- `nodeId`: UUID

### Response — 200 OK

**Body** (`DeleteNodeResponse`):

```json
{
  "data": {
    "success": true,
    "deletedNodeId": "a1b2c3d4-...",
    "deletedEdgeIds": ["x1y2z3-...", "p4q5r6-..."],
    "boardRevision": 7
  },
  "error": null
}
```

**Note**: The existing OpenAPI `DeleteNodeResponse` only includes `success` and `deletedNodeId`. This implementation MUST add `deletedEdgeIds` (array of UUIDs) and `boardRevision` so the frontend can remove cascaded edges and update its sync token. The OpenAPI spec should be updated in the same changeset.

### Error Responses

| Status | When |
|--------|------|
| 404 | Node not found or already soft-deleted |
| 409 | Node is locked; or board is archived |

---

## Response Envelope

All responses follow the standard envelope:

```typescript
{
  data: T;
  error: null;   // null on success
}
```

Error responses follow:

```typescript
{
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

---

## OpenAPI Spec Updates Required

This slice requires additive updates to `documentation/openapi.yaml`:

1. **NodeResponse**: Add optional `boardRevision` integer field to `data` alongside `node`.
2. **DeleteNodeResponse**: Add `deletedEdgeIds` (array of UUID strings) and `boardRevision` integer to `data`.

These changes are additive and do not break existing consumers.
