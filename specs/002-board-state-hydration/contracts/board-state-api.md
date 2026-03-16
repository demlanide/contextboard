# API Contract: Board State Hydration

**Feature**: 002-board-state-hydration | **Date**: 2026-03-16
**Source**: `documentation/openapi.yaml`, `documentation/api.md`

---

## GET /api/boards/{boardId}/state

Hydrate full active board state in a single request.

### Path Parameters

| Name | Type | Format | Required | Validation |
|------|------|--------|----------|------------|
| boardId | string | uuid | yes | 400 if malformed UUID |

### Response: 200 OK

Content-Type: `application/json`

```json
{
  "data": {
    "board": {
      "id": "uuid",
      "title": "Travel app brainstorm",
      "description": "Ideas and flows",
      "status": "active",
      "viewportState": { "x": 0, "y": 0, "zoom": 1 },
      "settings": {
        "gridEnabled": true,
        "snapToGrid": false,
        "agentEditMode": "suggest"
      },
      "summary": {},
      "revision": 12,
      "createdAt": "2026-03-15T20:00:00.000Z",
      "updatedAt": "2026-03-15T20:01:00.000Z"
    },
    "nodes": [
      {
        "id": "uuid",
        "boardId": "uuid",
        "type": "sticky",
        "parentId": null,
        "x": 100,
        "y": 120,
        "width": 240,
        "height": 120,
        "rotation": 0,
        "zIndex": 1,
        "content": { "text": "New note" },
        "style": { "backgroundColor": "#FFF59D" },
        "metadata": { "groupId": null, "aiGenerated": false },
        "locked": false,
        "hidden": false,
        "createdAt": "2026-03-15T20:00:00.000Z",
        "updatedAt": "2026-03-15T20:00:00.000Z"
      }
    ],
    "edges": [
      {
        "id": "uuid",
        "boardId": "uuid",
        "sourceNodeId": "uuid",
        "targetNodeId": "uuid",
        "label": "leads to",
        "style": {},
        "metadata": {},
        "createdAt": "2026-03-15T20:00:00.000Z",
        "updatedAt": "2026-03-15T20:00:00.000Z"
      }
    ],
    "chatThread": {
      "id": "uuid",
      "boardId": "uuid",
      "metadata": {},
      "createdAt": "2026-03-15T20:00:00.000Z",
      "updatedAt": "2026-03-15T20:00:00.000Z"
    },
    "lastOperationRevision": 12
  },
  "error": null
}
```

### Response Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| data.board | Board | yes | Full board metadata object |
| data.nodes | Node[] | yes | Active (non-deleted) nodes, ordered by zIndex ASC then createdAt ASC |
| data.edges | Edge[] | yes | Active (non-deleted) edges, ordered by createdAt ASC |
| data.chatThread | ChatThread | yes | Board's auto-created chat thread metadata |
| data.lastOperationRevision | integer | yes | Board's current revision value (sync baseline) |
| error | null | yes | Always null on success |

### Empty Board Response

For a newly created board with no nodes or edges:

```json
{
  "data": {
    "board": {
      "id": "uuid",
      "title": "New Board",
      "description": null,
      "status": "active",
      "viewportState": { "x": 0, "y": 0, "zoom": 1 },
      "settings": { "gridEnabled": true, "snapToGrid": false, "agentEditMode": "suggest" },
      "summary": {},
      "revision": 0,
      "createdAt": "2026-03-16T10:00:00.000Z",
      "updatedAt": "2026-03-16T10:00:00.000Z"
    },
    "nodes": [],
    "edges": [],
    "chatThread": {
      "id": "uuid",
      "boardId": "uuid",
      "metadata": {},
      "createdAt": "2026-03-16T10:00:00.000Z",
      "updatedAt": "2026-03-16T10:00:00.000Z"
    },
    "lastOperationRevision": 0
  },
  "error": null
}
```

### Response: 400 Bad Request

Returned when the boardId path parameter is not a valid UUID.

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid board ID format",
    "details": { "boardId": "not-a-uuid" }
  }
}
```

### Response: 404 Not Found

Returned when the board does not exist or has status `deleted`.

```json
{
  "data": null,
  "error": {
    "code": "BOARD_NOT_FOUND",
    "message": "Board not found",
    "details": {}
  }
}
```

### Response: 500 Internal Server Error

Returned when the board exists but the chat thread is missing (data
integrity failure).

```json
{
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Board state could not be loaded",
    "details": {}
  }
}
```

---

## Behavioral Rules

| Rule | Description |
|------|-------------|
| Read-only | This endpoint MUST NOT mutate any data, increment revision, or write operations |
| Soft-delete filtering | Nodes and edges with `deleted_at IS NOT NULL` are excluded |
| Deleted boards | Boards with status `deleted` return 404 BOARD_NOT_FOUND |
| Archived boards | Boards with status `archived` return 200 with full state |
| Empty arrays | `nodes` and `edges` are always arrays, never null or omitted |
| Stable shape | Response envelope shape is identical regardless of board content |
| Revision source | `lastOperationRevision` is always equal to `boards.revision` |

---

## OpenAPI Reference

Defined in `documentation/openapi.yaml` as:
- Path: `/boards/{boardId}/state`
- Operation: `getBoardState`
- Response schema: `GetBoardStateResponse`
- Tags: `state`

---

## Test Matrix Reference

- **T007**: Get state — hydration returns nodes/edges/chat, excludes
  deleted items (P0, Automated)
