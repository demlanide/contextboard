# Context Board MVP — API Reference

## 1. API Overview

This API supports a single-user MVP for an AI-first visual whiteboard.

Core rules:
- no authentication in MVP
- one board = one chat thread
- backend is source of truth
- agent can suggest or apply structured edits
- all durable mutations are logged as operations
- batch mutation is atomic
- board revision is the sync primitive

Base path:
- `/api`

Versioning:
- MVP contract uses `/api` without a version segment
- add `/v1` only when introducing a breaking API version

Content type:
- `application/json` for standard endpoints
- `application/merge-patch+json` for all `PATCH` endpoints
- `multipart/form-data` for uploads

---

## 2. Common Conventions

### 2.1 Response envelope

Success:
```json
{
  "data": {},
  "error": null
}
```

Failure:
```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid node type",
    "details": {}
  }
}
```

### 2.2 IDs and timestamps
- all ids are UUID strings
- timestamps are ISO 8601 UTC strings

### 2.3 Revisions
- `board.revision` increments once per committed mutation batch
- clients should treat revision as authoritative sync token

### 2.4 Patch semantics
PATCH uses JSON Merge Patch style semantics:
- scalars overwrite
- nested objects merge
- arrays replace fully
- `null` removes nullable object keys where supported
- PATCH requests MUST use `application/merge-patch+json`

### 2.5 Batch semantics
Batch mutation endpoints are atomic:
- all operations succeed, or none do

### 2.6 Idempotency
Recommended for mutating POST endpoints via:
- `Idempotency-Key` header

Supported/recommended on:
- create board
- create node
- batch mutations
- create edge
- apply agent actions

---

## 3. Enums

### 3.1 BoardStatus
- `active`
- `archived`
- `deleted`

### 3.2 NodeType
- `sticky`
- `text`
- `image`
- `shape`

### 3.3 ChatSenderType
- `user`
- `agent`
- `system`

### 3.4 AgentMode
- `suggest`
- `apply`

### 3.5 ActionPlanItemType
- `create_node`
- `update_node`
- `delete_node`
- `create_edge`
- `update_edge`
- `delete_edge`
- `batch_layout`

---

## 4. Resource Schemas

## 4.1 Board

```json
{
  "id": "uuid",
  "title": "Travel app brainstorm",
  "description": "Ideas and flows",
  "status": "active",
  "viewportState": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "settings": {
    "gridEnabled": true,
    "snapToGrid": false,
    "agentEditMode": "suggest"
  },
  "summary": {},
  "revision": 12,
  "createdAt": "2026-03-15T20:00:00.000Z",
  "updatedAt": "2026-03-15T20:01:00.000Z"
}
```

## 4.2 Node

```json
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
  "content": {
    "text": "New note"
  },
  "style": {
    "backgroundColor": "#FFF59D"
  },
  "metadata": {
    "groupId": null,
    "aiGenerated": false
  },
  "locked": false,
  "hidden": false,
  "createdAt": "2026-03-15T20:00:00.000Z",
  "updatedAt": "2026-03-15T20:00:00.000Z"
}
```

## 4.3 Edge

```json
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
```

## 4.4 ChatMessage

```json
{
  "id": "uuid",
  "threadId": "uuid",
  "senderType": "user",
  "messageText": "Summarize these notes",
  "messageJson": {},
  "selectionContext": {
    "selectedNodeIds": ["uuid1", "uuid2"],
    "selectedEdgeIds": [],
    "viewport": {
      "x": 0,
      "y": 0,
      "zoom": 1
    }
  },
  "createdAt": "2026-03-15T20:00:00.000Z"
}
```

## 4.5 Asset

```json
{
  "id": "uuid",
  "boardId": "uuid",
  "kind": "image",
  "mimeType": "image/png",
  "originalFilename": "reference.png",
  "url": "/api/assets/uuid/file",
  "thumbnailUrl": "/api/assets/uuid/thumbnail",
  "fileSizeBytes": 234567,
  "width": 1280,
  "height": 720,
  "processingStatus": "ready",
  "extractedText": null,
  "aiCaption": null,
  "metadata": {},
  "createdAt": "2026-03-15T20:00:00.000Z",
  "updatedAt": "2026-03-15T20:00:00.000Z"
}
```

---

## 5. Boards

### POST /api/boards
Create a new board and its default chat thread.

Returns:
- `201 Created`

Request:
```json
{
  "title": "Travel app brainstorm",
  "description": "Ideas and flows"
}
```

Response:
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
      "revision": 0,
      "createdAt": "2026-03-15T20:00:00.000Z",
      "updatedAt": "2026-03-15T20:00:00.000Z"
    },
    "chatThread": {
      "id": "uuid",
      "boardId": "uuid"
    }
  },
  "error": null
}
```

Validation:
- title required, 1–200 chars
- description max 10,000 chars

---

### GET /api/boards
List non-deleted boards.

Response:
```json
{
  "data": {
    "boards": []
  },
  "error": null
}
```

---

### GET /api/boards/:boardId
Get board metadata.

---

### PATCH /api/boards/:boardId
Update board metadata and board-level settings.

Request content type:
- `application/merge-patch+json`

Request:
```json
{
  "title": "New board title",
  "description": "Updated description",
  "viewportState": {
    "x": 120,
    "y": 80,
    "zoom": 1.1
  },
  "settings": {
    "gridEnabled": false,
    "snapToGrid": true,
    "agentEditMode": "apply"
  }
}
```

Rules:
- partial update
- revision increments only on successful update
- archived boards are read-only

---

### DELETE /api/boards/:boardId
Soft-delete board by setting status to `deleted`.

Rules:
- delete is soft-delete only in MVP
- after delete, normal `GET /api/boards/:boardId` and `GET /api/boards/:boardId/state` return `404 BOARD_NOT_FOUND`

Response:
```json
{
  "data": {
    "success": true,
    "boardId": "uuid"
  },
  "error": null
}
```

---

## 6. Board State

### GET /api/boards/:boardId/state
Hydrate full active board state.

Response:
```json
{
  "data": {
    "board": {},
    "nodes": [],
    "edges": [],
    "chatThread": {
      "id": "uuid",
      "boardId": "uuid"
    },
    "lastOperationRevision": 12
  },
  "error": null
}
```

Notes:
- full-state hydration is acceptable in MVP
- later optimization may add viewport-based partial loading

---

## 7. Nodes

### POST /api/boards/:boardId/nodes
Create one node.

Returns:
- `201 Created`

Request:
```json
{
  "type": "sticky",
  "parentId": null,
  "x": 100,
  "y": 120,
  "width": 240,
  "height": 120,
  "rotation": 0,
  "zIndex": 1,
  "content": {
    "text": "New note"
  },
  "style": {
    "backgroundColor": "#FFF59D"
  },
  "metadata": {
    "groupId": null,
    "aiGenerated": false
  }
}
```

Validation:
- type required
- supported types only
- width/height > 0
- width/height <= 10000
- content must satisfy type-specific rules
- image nodes with a missing or incompatible `assetId` are rejected with `422 VALIDATION_ERROR`

---

### PATCH /api/nodes/:nodeId
Partial update to node.

Request content type:
- `application/merge-patch+json`

Request:
```json
{
  "x": 180,
  "y": 220,
  "content": {
    "text": "Updated note"
  },
  "metadata": {
    "groupId": "uuid-group"
  }
}
```

Rules:
- partial merge
- locked nodes cannot be edited
- node must belong to active board
- locked node updates return `409 LOCKED_NODE`

---

### DELETE /api/nodes/:nodeId
Soft-delete node and soft-delete connected edges in same transaction.

Response:
```json
{
  "data": {
    "success": true,
    "deletedNodeId": "uuid"
  },
  "error": null
}
```

---

### POST /api/boards/:boardId/nodes/batch
Atomic batch node mutation.

Request:
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
        "content": {
          "text": "Theme A"
        },
        "style": {},
        "metadata": {
          "aiGenerated": true
        }
      }
    },
    {
      "type": "update",
      "nodeId": "uuid-node-1",
      "changes": {
        "x": 320,
        "y": 100
      }
    },
    {
      "type": "delete",
      "nodeId": "uuid-node-2"
    }
  ]
}
```

Rules:
- all-or-nothing
- operations processed in order
- max 200 operations
- revision increments once for whole batch

Response:
```json
{
  "data": {
    "batchId": "uuid",
    "boardRevision": 13,
    "created": [],
    "updated": [],
    "deleted": []
  },
  "error": null
}
```

---

## 8. Edges

### POST /api/boards/:boardId/edges
Create one edge.

Returns:
- `201 Created`

Request:
```json
{
  "sourceNodeId": "uuid-node-1",
  "targetNodeId": "uuid-node-2",
  "label": "leads to",
  "style": {},
  "metadata": {}
}
```

Validation:
- source and target must exist
- source and target must belong to same board
- source and target cannot be equal
- deleted nodes cannot be used

---

### PATCH /api/edges/:edgeId
Partial update to edge.

Request content type:
- `application/merge-patch+json`

### DELETE /api/edges/:edgeId
Soft-delete edge.

---

## 9. Assets

### POST /api/assets/upload
Upload file or image.

Returns:
- `201 Created`

Request:
- `multipart/form-data`

Response:
```json
{
  "data": {
    "asset": {
      "id": "uuid",
      "boardId": null,
      "kind": "image",
      "mimeType": "image/png",
      "originalFilename": "idea.png",
      "url": "/api/assets/uuid/file",
      "thumbnailUrl": "/api/assets/uuid/thumbnail",
      "fileSizeBytes": 234567,
      "width": 1280,
      "height": 720,
      "processingStatus": "ready",
      "extractedText": null,
      "aiCaption": null,
      "metadata": {},
      "createdAt": "2026-03-15T20:00:00.000Z",
      "updatedAt": "2026-03-15T20:00:00.000Z"
    }
  },
  "error": null
}
```

Validation:
- image max 20 MB
- generic file max 50 MB
- allowed mime types configurable

---

### GET /api/assets/:assetId
Get asset metadata.

### GET /api/assets/:assetId/file
Download/stream original asset.

Rules:
- unknown asset id returns `404 ASSET_NOT_FOUND`
- response body is raw file bytes with the stored file content type

### GET /api/assets/:assetId/thumbnail
Get thumbnail if available.

Rules:
- unknown asset id returns `404 ASSET_NOT_FOUND`
- asset without a generated thumbnail returns `404 ASSET_THUMBNAIL_NOT_AVAILABLE`
- MVP does not return a fallback thumbnail

---

## 10. Chat

### GET /api/boards/:boardId/chat
Get board thread and recent messages.

Response:
```json
{
  "data": {
    "thread": {
      "id": "uuid",
      "boardId": "uuid"
    },
    "messages": []
  },
  "error": null
}
```

---

### POST /api/boards/:boardId/chat/messages
Append a user message and get agent response.

Request:
```json
{
  "message": "Summarize these notes",
  "selectionContext": {
    "selectedNodeIds": ["uuid-node-1", "uuid-node-2"],
    "selectedEdgeIds": [],
    "viewport": {
      "x": 0,
      "y": 0,
      "zoom": 1
    }
  }
}
```

Response:
```json
{
  "data": {
    "userMessage": {},
    "agentMessage": {}
  },
  "error": null
}
```

Notes:
- user message should store selection context
- agent message may include `messageJson.actionPlan`
- plain chat response should not mutate board state by itself

---

## 11. Agent Actions

### POST /api/boards/:boardId/agent/actions
Ask agent to analyze board and optionally return action plan.

Request:
```json
{
  "prompt": "Group these notes by theme and arrange them neatly",
  "mode": "suggest",
  "selectionContext": {
    "selectedNodeIds": ["uuid-node-1", "uuid-node-2", "uuid-node-3"],
    "selectedEdgeIds": [],
    "viewport": {
      "x": 0,
      "y": 0,
      "zoom": 1.1
    }
  }
}
```

Response:
```json
{
  "data": {
    "message": {
      "id": "uuid-msg-agent",
      "threadId": "uuid-thread",
      "senderType": "agent",
      "messageText": "I grouped these into two themes and prepared a cleaner layout.",
      "messageJson": {
        "actionPlan": [
          {
            "type": "update_node",
            "targetId": "uuid-node-1",
            "changes": {
              "x": 120,
              "y": 140
            }
          },
          {
            "type": "create_node",
            "tempId": "tmp-1",
            "node": {
              "type": "sticky",
              "x": 500,
              "y": 80,
              "width": 220,
              "height": 80,
              "content": {
                "text": "Theme B"
              },
              "style": {},
              "metadata": {
                "aiGenerated": true
              }
            }
          }
        ]
      },
      "selectionContext": {},
      "createdAt": "2026-03-15T20:00:02.000Z"
    },
    "actionPlan": [],
    "preview": {
      "affectedNodeIds": [],
      "newNodeTempIds": []
    }
  },
  "error": null
}
```

Rules:
- `suggest` must not mutate board state
- action plans must use allowed action item types only
- backend should validate agent output before returning it

---

### POST /api/boards/:boardId/agent/actions/apply
Validate and apply an agent-generated action plan in a single atomic transaction.

Request:
```json
{
  "mode": "apply",
  "actionPlan": [
    {
      "type": "update_node",
      "nodeId": "uuid-node-1",
      "patch": {
        "x": 120,
        "y": 140
      }
    },
    {
      "type": "create_node",
      "tempId": "tmp-1",
      "node": {
        "type": "sticky",
        "x": 500,
        "y": 80,
        "width": 220,
        "height": 80,
        "content": { "text": "Theme B" },
        "style": {},
        "metadata": { "aiGenerated": true }
      }
    }
  ]
}
```

Rules:
- atomic transaction — all or nothing
- board revision increments exactly once on success
- all changes write operation rows with `actorType: 'agent'`
- invalid action plan fails the whole request (no partial commits)
- idempotency key derived from normalized plan + board revision; duplicate apply returns cached 200
- max 200 operations per apply; max 1 MB payload
- rate-limited to 20 requests per window

Success response (200):
```json
{
  "boardRevision": 14,
  "updatedBoard": {
    "id": "uuid-board",
    "revision": 14,
    "nodes": [],
    "edges": []
  },
  "tempIdMapping": {
    "nodes": { "tmp-1": "uuid-new-node" },
    "edges": {}
  }
}
```

Error responses:
- 409 `LOCKED_NODE` — plan targets locked nodes
- 422 `ACTION_PLAN_INVALID` — broken references, schema violations
- 413 `ACTION_PLAN_TOO_LARGE` — plan exceeds size/operation limits
- 404 `BOARD_NOT_FOUND` — board does not exist
- 409 `BOARD_ARCHIVED` — board is archived

---

## 12. Action Plan Schema

### 12.1 create_node
```json
{
  "type": "create_node",
  "tempId": "tmp-1",
  "node": {
    "type": "sticky",
    "x": 100,
    "y": 100,
    "width": 240,
    "height": 120,
    "content": {
      "text": "New idea"
    },
    "style": {},
    "metadata": {
      "aiGenerated": true
    }
  }
}
```

### 12.2 update_node
```json
{
  "type": "update_node",
  "targetId": "uuid-node-1",
  "changes": {
    "x": 200,
    "y": 300,
    "content": {
      "text": "Rewritten text"
    }
  }
}
```

### 12.3 delete_node
```json
{
  "type": "delete_node",
  "targetId": "uuid-node-2"
}
```

### 12.4 create_edge
```json
{
  "type": "create_edge",
  "tempId": "tmp-edge-1",
  "edge": {
    "sourceNodeId": "uuid-node-1",
    "targetNodeId": "uuid-node-2",
    "label": "leads to",
    "style": {},
    "metadata": {}
  }
}
```

### 12.5 update_edge
```json
{
  "type": "update_edge",
  "targetId": "uuid-edge-1",
  "changes": {
    "label": "depends on",
    "style": {
      "lineStyle": "dashed"
    }
  }
}
```

### 12.6 delete_edge
```json
{
  "type": "delete_edge",
  "targetId": "uuid-edge-1"
}
```

### 12.7 batch_layout
```json
{
  "type": "batch_layout",
  "items": [
    {
      "nodeId": "uuid-node-1",
      "x": 100,
      "y": 100
    },
    {
      "nodeId": "uuid-node-2",
      "x": 100,
      "y": 260
    }
  ]
}
```

---

## 13. Validation Rules

### 13.1 Board
- title: 1–200 chars
- description: max 10,000 chars
- viewportState must be object
- settings must be object

### 13.2 Node
- supported node type only
- width/height > 0 and <= 10000
- image nodes require `content.assetId`
- shape nodes require `content.shapeType`
- locked nodes cannot be mutated by normal edit/apply endpoints

### 13.3 Edge
- source/target must exist
- same board only
- no self-loop in MVP

### 13.4 Chat
- message max 20,000 chars
- selectionContext must be object if present

### 13.5 Action plan
- only allowed action types
- referenced ids must exist where required
- all targets must belong to same board
- destructive or invalid items invalidate whole apply request

---

## 14. Error Handling

### 14.1 Envelope
```json
{
  "data": null,
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "Node not found",
    "details": {
      "nodeId": "uuid"
    }
  }
}
```

### 14.2 Recommended error codes
- `BOARD_NOT_FOUND`
- `BOARD_ARCHIVED`
- `NODE_NOT_FOUND`
- `EDGE_NOT_FOUND`
- `ASSET_NOT_FOUND`
- `ASSET_THUMBNAIL_NOT_AVAILABLE`
- `CHAT_THREAD_NOT_FOUND`
- `VALIDATION_ERROR`
- `INVALID_NODE_TYPE`
- `INVALID_EDGE_REFERENCE`
- `LOCKED_NODE`
- `ACTION_PLAN_INVALID`
- `BATCH_APPLY_FAILED`
- `IDEMPOTENCY_CONFLICT`
- `INTERNAL_ERROR`

### 14.3 Suggested HTTP mapping
- 400: malformed request
- 404: missing resource
- 409: conflict / locked resource / idempotency mismatch / invalid state transition
- 413: payload too large
- 415: unsupported media type
- 422: validation failure
- 500: unexpected server error

---

## 15. Frontend Sync Contract

For MVP:
- `GET /boards/:boardId/state` is initial hydration endpoint
- mutation endpoints return updated resource or diff
- client should replace local state from server response for touched entities
- board revision should be updated from response
- no realtime guarantees
- optional polling against operations/revision can be added later

---

## 16. Operations API

The Operations API enables incremental board sync. Clients poll this endpoint to receive committed mutations since their last known revision, apply them to local state, and advance their cursor — keeping the board in sync without a full page reload.

### GET /api/boards/:boardId/operations

Query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `afterRevision` | integer | `0` | Return operations with `boardRevision > afterRevision`. Defaults to 0 (return all). |
| `limit` | integer | `100` | Max results per page. Capped server-side at 500. |

Rate limit: 120 requests/minute.

#### 200 — Operations returned

```json
{
  "data": {
    "operations": [
      {
        "id": "uuid",
        "boardId": "uuid",
        "boardRevision": 14,
        "actorType": "user",
        "operationType": "create_node",
        "targetType": "node",
        "targetId": "uuid",
        "batchId": null,
        "payload": { "id": "uuid", "type": "sticky", "x": 100, "y": 200 },
        "inversePayload": null,
        "createdAt": "2026-04-14T10:00:00Z"
      }
    ],
    "nextCursor": "14",
    "headRevision": 14
  },
  "error": null
}
```

#### 200 — Caught up (no new operations)

```json
{
  "data": {
    "operations": [],
    "nextCursor": null,
    "headRevision": 14
  },
  "error": null
}
```

#### 400 — Invalid query parameters

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "afterRevision must be a non-negative integer",
    "details": { "field": "afterRevision" }
  }
}
```

#### 404 — Board not found

```json
{
  "data": null,
  "error": { "code": "BOARD_NOT_FOUND", "message": "Board not found" }
}
```

#### 410 — Stale cursor

Returned when `afterRevision` is below the server's minimum safe revision (purged history or initial bootstrap).

```json
{
  "data": null,
  "error": {
    "code": "CURSOR_INVALID",
    "message": "Cursor is below minimum safe revision",
    "details": { "minSafeRevision": 50 }
  }
}
```

Clients receiving 410 must discard local state and rehydrate via `GET /api/boards/:boardId/state`.

### headRevision semantics

`headRevision` is the board's current committed revision at the time of the response. Clients use it to detect gaps:

- If `operations` is empty and `headRevision > afterRevision`, a consistency gap has been detected — rehydrate.
- If `operations` is non-empty, advance the local cursor to `operations[last].boardRevision`.

### Pagination (nextCursor)

`nextCursor` is a non-null string when more pages are available. Use it as `afterRevision` for the next call:

```
GET /operations?afterRevision=0&limit=100   → nextCursor: "100"
GET /operations?afterRevision=100&limit=100 → nextCursor: "200"
GET /operations?afterRevision=200&limit=100 → nextCursor: null  (done)
```

### Client polling behavior

- Poll interval: 10 seconds when tab is active, 30 seconds when tab is backgrounded.
- Pause polling while any durable mutation is in-flight (optimistic create/update/delete, batch, agent apply).
- On 410: rehydrate via `GET /state`, resume polling from new revision.
- On 3 consecutive network/5xx errors: surface sync-error state to the user.
- On 404: stop polling (board was deleted).

### Use cases
- Incremental board sync after inactivity
- Paginated catchup after large operation backlog
- Stale-state detection and auto-recovery
- Audit and debug

---

## 17. End-to-End Example Flows

### 17.1 Create board, add note, fetch state
1. `POST /api/boards`
2. `POST /api/boards/:boardId/nodes`
3. `GET /api/boards/:boardId/state`

### 17.2 Upload image and place it on board
1. `POST /api/assets/upload`
2. `POST /api/boards/:boardId/nodes` with `type = image`
3. `GET /api/boards/:boardId/state`

### 17.3 Ask agent to organize selection
1. `POST /api/boards/:boardId/chat/messages`
2. `POST /api/boards/:boardId/agent/actions` with `mode = suggest`
3. user reviews preview
4. `POST /api/boards/:boardId/agent/actions/apply`
5. `GET /api/boards/:boardId/state` if needed

---

## 18. Non-Functional Limits

Recommended MVP limits:
- max nodes per board: 5,000 soft limit
- max edges per board: 10,000 soft limit
- max batch operations: 200
- max message length: 20,000 chars
- max image upload: 20 MB
- max generic file upload: 50 MB
- suggest endpoint hard timeout budget: about 20 seconds, with internal LLM work typically bounded to an 18 second total budget
- apply endpoint hard timeout budget: about 10 seconds

---

## 19. Future-Compatible Notes

Not in MVP but planned-compatible:
- auth
- board ownership
- multiple users
- multiple chat threads per board
- realtime sync
- optimistic concurrency headers
- granular permissions

The API and data model are designed so these are additive changes.
