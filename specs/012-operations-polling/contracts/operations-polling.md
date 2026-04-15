# Contract: GET /boards/{boardId}/operations

Aligned with `documentation/openapi.yaml` — `getBoardOperations` operation.  
This document records the complete contract including Phase 1 extensions not yet in the OpenAPI file.

---

## Endpoint

```
GET /api/boards/{boardId}/operations
```

**Tags**: `operations`  
**OperationId**: `getBoardOperations`

---

## Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | UUID string | Yes | The board to poll operations for. Must be an existing, non-deleted board. |

---

## Query Parameters

| Parameter | Type | Required | Default | Constraints | Description |
|-----------|------|----------|---------|-------------|-------------|
| `afterRevision` | integer | No | `0` | `minimum: 0` | Returns only operations with `boardRevision` strictly greater than this value. When omitted, defaults to `0` (returns all history from the start), subject to `limit`. |
| `limit` | integer | No | `100` | `minimum: 1`, `maximum: 500`, server cap: `POLLING_MAX_PAGE_SIZE` | Maximum operations to return. Values above the server-configured maximum are silently capped, not rejected. |

**Config reference**: `POLLING_MAX_PAGE_SIZE` lives in `backend/src/config/limits.ts`. Initial MVP value: `100`.

---

## Successful Response — 200 OK

### When operations exist after `afterRevision`:

```json
{
  "data": {
    "operations": [
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "boardId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "boardRevision": 13,
        "actorType": "user",
        "operationType": "create_node",
        "targetType": "node",
        "targetId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "batchId": null,
        "payload": { "type": "sticky", "x": 100, "y": 200 },
        "inversePayload": null,
        "createdAt": "2026-04-14T10:00:00.000Z"
      }
    ],
    "nextCursor": "13",
    "headRevision": 15
  },
  "error": null
}
```

**`operations`**: Ordered by `(boardRevision ASC, id ASC)`. Every entry has `boardRevision > afterRevision`.  
**`nextCursor`**: String representation of the last operation's `boardRevision`. Use as the next `afterRevision` value when chaining polling calls. Non-null when at least one operation was returned.  
**`headRevision`**: The board's current confirmed revision at response time. Always ≥ the highest `boardRevision` in `operations`.

### When no new operations exist (client is caught up):

```json
{
  "data": {
    "operations": [],
    "nextCursor": null,
    "headRevision": 12
  },
  "error": null
}
```

**Client behavior**: Keep the current `pollingCursor` unchanged. If `headRevision > afterRevision` and `operations` is empty, treat as a gap and trigger a full rehydrate.

### When the last page of a paginated fetch is returned:

Same shape as the caught-up response but `headRevision > nextCursor` may still be true (board advanced further after the last page). Client continues polling with the last operation's revision as `afterRevision`.

---

## Stale / Invalid Cursor — 410 Gone

Returned when `afterRevision` is outside the server's safe polling window (activated by `POLLING_MIN_SAFE_REVISION_WINDOW` config, default `0` for MVP — this response will not fire in MVP unless config is changed).

```json
{
  "data": null,
  "error": {
    "code": "CURSOR_INVALID",
    "message": "afterRevision is outside the safe polling window; perform a full board-state rehydrate before resuming incremental polling",
    "details": {
      "minSafeRevision": 5000
    }
  }
}
```

**Client behavior**: Discard the current polling cursor. Perform a full board-state rehydrate via `GET /boards/{boardId}/state`. On success, set `pollingCursor` to the rehydrated revision and resume polling.

---

## Validation Error — 400 Bad Request

Returned when query parameters fail schema validation (e.g., `afterRevision` is not a non-negative integer, `limit` is not a positive integer).

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": {
      "afterRevision": "must be a non-negative integer"
    }
  }
}
```

---

## Board Not Found — 404 Not Found

Returned when `boardId` does not exist or the board has been soft-deleted (`status = 'deleted'`).

```json
{
  "data": null,
  "error": {
    "code": "BOARD_NOT_FOUND",
    "message": "Board not found"
  }
}
```

**Note**: Archived boards (`status = 'archived'`) return operations normally. The archive status does not block the read path.

---

## OpenAPI Changes Required

The following changes to `documentation/openapi.yaml` must be made before implementation (Constitution Gate VI):

### 1. Add `410` response to `/boards/{boardId}/operations` GET

```yaml
'410':
  description: Cursor no longer valid — full board-state rehydrate required
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/ErrorEnvelope'
      example:
        data: null
        error:
          code: CURSOR_INVALID
          message: "afterRevision is outside the safe polling window; perform a full board-state rehydrate"
          details:
            minSafeRevision: 5000
```

### 2. Add `headRevision` to `GetOperationsResponse.data`

```yaml
GetOperationsResponse:
  allOf:
    - $ref: '#/components/schemas/SuccessEnvelopeBase'
    - type: object
      properties:
        data:
          type: object
          required: [operations, nextCursor, headRevision]   # add headRevision here
          properties:
            operations:
              type: array
              items:
                $ref: '#/components/schemas/Operation'
            nextCursor:
              type: string
              nullable: true
            headRevision:                                    # NEW
              type: integer
              description: Current confirmed board revision at response time
```

### 3. Document `afterRevision` default behavior

```yaml
- name: afterRevision
  in: query
  required: false
  description: >
    Returns only operations with boardRevision strictly greater than this value.
    When omitted, defaults to 0 (returns all committed operations from the start of board history),
    subject to the limit cap.
  schema:
    type: integer
    minimum: 0
    default: 0
```

---

## Rate Limits

| Endpoint class | Limit |
|----------------|-------|
| Reads (this endpoint) | 120 req/min |

Applied via the existing rate-limit middleware configured in `config/limits.ts`.

---

## Timeout Budget

| Class | Hard timeout | p50 target | p95 target |
|-------|-------------|------------|------------|
| Fast reads | 2s | 150ms | 400ms |

The operations polling endpoint is classified as a fast read. The server should enforce a 2s hard timeout via `POLLING_HARD_TIMEOUT_MS` in `config/limits.ts`.

---

## Observability Events

The handler must emit structured log events for:

| Event | Level | Fields |
|-------|-------|--------|
| Polling request received | `debug` | `boardId`, `afterRevision`, `limit`, `requestId` |
| Operations returned | `info` | `boardId`, `afterRevision`, `count`, `headRevision`, `durationMs`, `requestId` |
| Empty response (caught up) | `debug` | `boardId`, `afterRevision`, `headRevision`, `requestId` |
| Stale cursor (410) | `warn` | `boardId`, `afterRevision`, `minSafeRevision`, `requestId` |
| Board not found (404) | `info` | `boardId`, `requestId` |
| Unexpected error | `error` | `boardId`, `afterRevision`, `error.message`, `error.stack`, `requestId` |
