# API Consumption Contract: Frontend Foundation

**Feature**: 004-frontend-foundation
**Date**: 2026-03-16

## Overview

This document defines the backend API endpoints consumed by the frontend
in this slice, the expected request/response shapes, and error handling
behavior. All endpoints are already defined in `documentation/openapi.yaml`
and implemented in S1–S2. The frontend does not create any new API surface.

## Base Configuration

- **Base URL**: Configurable via environment variable (default: `/api`)
- **Content Type**: `application/json` for all requests
- **Request Timeout**: Configurable (default: 10 seconds)
- **Response Envelope**: All responses use `{ data, error }` pattern

## Endpoints

### 1. List Boards

**Endpoint**: `GET /api/boards`
**Used by**: Starting screen (HomePage)

**Request**: No body, no query parameters.

**Success Response** (200):
```json
{
  "data": {
    "boards": [
      {
        "id": "uuid",
        "title": "Board title",
        "description": "Optional description",
        "status": "active",
        "viewportState": { "x": 0, "y": 0, "zoom": 1 },
        "settings": { "gridEnabled": true, "snapToGrid": false, "agentEditMode": "suggest" },
        "summary": {},
        "revision": 5,
        "createdAt": "2026-03-16T10:00:00.000Z",
        "updatedAt": "2026-03-16T12:00:00.000Z"
      }
    ]
  },
  "error": null
}
```

**Frontend behavior**:
- Map `boards` array to `BoardListItem[]` for display
- Filter: deleted boards are excluded by the backend
- Sort: use backend-provided order (updatedAt descending)
- Show archived boards with visual indicator based on `status` field

**Error handling**:
- Network failure → show error with retry option
- 5xx → show generic error with retry option

---

### 2. Create Board

**Endpoint**: `POST /api/boards`
**Used by**: CreateBoardDialog on starting screen

**Request**:
```json
{
  "title": "My new board",
  "description": ""
}
```

- `title`: Required, 1–200 chars. Frontend provides default if user leaves blank.
- `description`: Optional, max 10,000 chars. Empty string in this slice.

**Success Response** (201):
```json
{
  "data": {
    "board": {
      "id": "uuid",
      "title": "My new board",
      "description": "",
      "status": "active",
      "viewportState": { "x": 0, "y": 0, "zoom": 1 },
      "settings": { "gridEnabled": true, "snapToGrid": false, "agentEditMode": "suggest" },
      "summary": {},
      "revision": 0,
      "createdAt": "2026-03-16T10:00:00.000Z",
      "updatedAt": "2026-03-16T10:00:00.000Z"
    },
    "chatThread": {
      "id": "uuid",
      "boardId": "uuid"
    }
  },
  "error": null
}
```

**Frontend behavior**:
- On 201: navigate to `/boards/{board.id}` which triggers hydration
- Disable create button while request is in-flight (FR-004)
- Re-enable on failure

**Error handling**:
- 422 VALIDATION_ERROR → show validation message inline
- Network failure → show error, keep dialog open, allow retry
- 5xx → show generic error with retry option

---

### 3. Hydrate Board State

**Endpoint**: `GET /api/boards/{boardId}/state`
**Used by**: BoardPage on mount and on browser refresh

**Request**: No body. `boardId` from URL path parameter.

**Success Response** (200):
```json
{
  "data": {
    "board": { "...full board object..." },
    "nodes": [ "...array of node objects..." ],
    "edges": [ "...array of edge objects..." ],
    "chatThread": { "id": "uuid", "boardId": "uuid" },
    "lastOperationRevision": 12
  },
  "error": null
}
```

**Frontend behavior**:
- Normalize `nodes` array into `nodesById` record and `nodeOrder` array
- Normalize `edges` array into `edgesById` record and `edgeOrder` array
- Set `board` from response
- Set `chatThread` from response
- Set `sync.lastSyncedRevision` from `board.revision`
- Set `sync.hydrateStatus = 'ready'`
- Check `board.status`: if `'archived'`, display read-only indicator

**Error handling**:
- 404 BOARD_NOT_FOUND → set `sync.hydrateStatus = 'error'`, show "board
  not found" with navigation back to starting screen (not retryable)
- Network failure / timeout → set `sync.hydrateStatus = 'error'`, show
  error with retry button (retryable)
- 5xx → set `sync.hydrateStatus = 'error'`, show generic error with
  retry (retryable)

## Error Envelope

All error responses follow this shape:

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

The frontend API client parses this envelope and maps error codes to
`SyncError` objects with `retryable` flags:

| Error Code | HTTP Status | Retryable | User Message |
|------------|-------------|-----------|--------------|
| BOARD_NOT_FOUND | 404 | No | "This board doesn't exist or has been deleted." |
| VALIDATION_ERROR | 422 | No | Show specific validation message |
| Network error | — | Yes | "Unable to reach the server. Check your connection." |
| Timeout | — | Yes | "The request timed out. Please try again." |
| Other 5xx | 500 | Yes | "Something went wrong. Please try again." |
