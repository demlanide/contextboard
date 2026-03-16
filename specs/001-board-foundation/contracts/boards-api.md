# API Contract: Board Endpoints

**Feature**: 001-board-foundation | **Date**: 2026-03-16
**Source**: `documentation/openapi.yaml`, `specs/001-board-foundation/spec.md`

This document defines the exact HTTP contract for all board endpoints
in this feature slice. All response bodies use the standard envelope
format: `{ data: T | null, error: ErrorInfo | null }`.

---

## Common Headers

| Header | Direction | Required | Notes |
|--------|-----------|----------|-------|
| `Content-Type` | Request | Yes for bodies | `application/json` (POST), `application/merge-patch+json` (PATCH) |
| `Idempotency-Key` | Request | No | Optional on POST/PATCH; string, min 1 char |
| `X-Request-Id` | Response | Always | Server-generated UUID for tracing |

---

## POST /api/boards

Create a new board with an auto-provisioned chat thread.

### Request

```json
{
  "title": "My Board",
  "description": "Optional description"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| title | string | Yes | 1–200 chars |
| description | string | No | max 10,000 chars |

### Responses

**201 Created**

```json
{
  "data": {
    "board": {
      "id": "uuid",
      "title": "My Board",
      "description": "Optional description",
      "status": "active",
      "viewportState": { "x": 0, "y": 0, "zoom": 1 },
      "settings": {},
      "summary": {},
      "revision": 0,
      "createdAt": "2026-03-16T00:00:00.000Z",
      "updatedAt": "2026-03-16T00:00:00.000Z"
    },
    "chatThread": {
      "id": "uuid",
      "boardId": "uuid",
      "metadata": {},
      "createdAt": "2026-03-16T00:00:00.000Z",
      "updatedAt": "2026-03-16T00:00:00.000Z"
    }
  },
  "error": null
}
```

**422 Validation Error** — missing title, title too long, etc.

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

### Side Effects

- Board row inserted with `revision = 0`, `status = active`
- Chat thread row inserted with same board_id
- Operation log: `create_board` at `board_revision = 0`
- If `Idempotency-Key` provided: response cached for 24h

### Test Matrix Ref

T001

---

## GET /api/boards

List all non-deleted boards.

### Request

No body. No query parameters in this slice.

### Responses

**200 OK**

```json
{
  "data": {
    "boards": [
      {
        "id": "uuid",
        "title": "My Board",
        "description": null,
        "status": "active",
        "viewportState": { "x": 0, "y": 0, "zoom": 1 },
        "settings": {},
        "summary": {},
        "revision": 3,
        "createdAt": "2026-03-16T00:00:00.000Z",
        "updatedAt": "2026-03-16T01:00:00.000Z"
      }
    ]
  },
  "error": null
}
```

### Behavior

- Returns boards where `status != 'deleted'`
- Sorted by `updated_at DESC`
- Includes archived boards (distinguishable by `status` field)
- Empty array if no boards exist (not 404)

### Test Matrix Ref

T002

---

## GET /api/boards/{boardId}

Get board metadata.

### Request

Path parameter: `boardId` (UUID)

### Responses

**200 OK**

```json
{
  "data": {
    "board": {
      "id": "uuid",
      "title": "My Board",
      "description": null,
      "status": "active",
      "viewportState": { "x": 0, "y": 0, "zoom": 1 },
      "settings": {},
      "summary": {},
      "revision": 0,
      "createdAt": "2026-03-16T00:00:00.000Z",
      "updatedAt": "2026-03-16T00:00:00.000Z"
    }
  },
  "error": null
}
```

**404 Not Found** — board does not exist OR is soft-deleted.

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

### Behavior

- Deleted boards return 404 (spec FR-013)
- Archived boards return 200 with `status: "archived"` (readable,
  not invisible)
- Invalid UUID format returns 422

### Test Matrix Ref

T003

---

## PATCH /api/boards/{boardId}

Update board metadata via JSON Merge Patch.

### Request

**Content-Type**: `application/merge-patch+json` (required — 415 if
wrong)

Path parameter: `boardId` (UUID)

**Metadata update** (title, description, viewport, settings, summary):

```json
{
  "title": "New Title"
}
```

**Archival** (status transition):

```json
{
  "status": "archived"
}
```

### Patchable Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| title | string | 1–200 chars | |
| description | string \| null | max 10,000 chars | null clears |
| viewportState | object | `{x, y, zoom}` | zoom > 0 |
| settings | object | | |
| summary | object | | |
| status | string | Allowed: `"archived"` only | See transition rules |

### Status Transition Rules (via PATCH)

| Current | Requested | Result |
|---------|-----------|--------|
| active | archived | 200 — archived, revision + 1 |
| active | active | 422 — no-op transition rejected |
| active | deleted | 422 — use DELETE endpoint |
| archived | active | 422 — un-archive not allowed in MVP |
| archived | * | 422 — archived boards are read-only |
| deleted | * | 404 — board not found |

### Responses

**200 OK** — returns full updated board (same shape as GET)

**404 Not Found** — board not found or deleted

**415 Unsupported Media Type** — wrong Content-Type

**422 Validation Error** — invalid fields, constraint violation, or
  forbidden status transition

### Side Effects

- Metadata update: `revision += 1`, `updated_at = now()`,
  op-log `update_board`
- Archive: `revision += 1`, `status = 'archived'`,
  `updated_at = now()`, op-log `archive_board`
- If `Idempotency-Key` provided: response cached

### Test Matrix Ref

T004, T005

---

## DELETE /api/boards/{boardId}

Soft-delete a board.

### Request

Path parameter: `boardId` (UUID). No body.

### Responses

**200 OK**

```json
{
  "data": {
    "success": true,
    "boardId": "uuid"
  },
  "error": null
}
```

**404 Not Found** — board not found or already deleted.

### Behavior

- Sets `status = 'deleted'`, `updated_at = now()`
- Does NOT increment revision (deleted boards are invisible to sync)
- Writes op-log `delete_board` entry using current (pre-delete)
  revision
- Idempotent: deleting an already-deleted board returns 404 (it is
  treated as not found per spec FR-013)
- Works on both active and archived boards
- Cascading: `chat_threads` row removed via FK CASCADE

### Test Matrix Ref

T006

---

## Error Codes

| Code | HTTP | When |
|------|------|------|
| VALIDATION_ERROR | 422 | Schema or domain validation fails |
| BOARD_NOT_FOUND | 404 | Board missing or soft-deleted |
| UNSUPPORTED_MEDIA_TYPE | 415 | PATCH without merge-patch content type |
| IDEMPOTENCY_CONFLICT | 409 | Key reused with different payload |

---

## OpenAPI Schema Changes Required

Per research findings R-002 and R-003:

1. **ChatThread schema**: Add `metadata` (object), `createdAt`
   (date-time), `updatedAt` (date-time) to match DDL
2. **UpdateBoardRequest**: Add `status` field with type `string` to
   enable archival via PATCH

These changes should be applied to `documentation/openapi.yaml`
before implementation begins.
