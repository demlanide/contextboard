# Quickstart: 012-Operations Polling

## Goal

Implement `GET /boards/{boardId}/operations?afterRevision=&limit=` and a client polling sync layer so that open boards stay in sync with committed backend state via lightweight incremental revision-based polling.

---

## Prerequisites

- S3 (Revision + Operations Foundation) is complete: `board_operations` table exists and is populated by all durable mutations.
- S3.5 (Frontend Foundation) is complete: `BoardStore` with `sync.lastSyncedRevision` exists.
- `GET /boards/{boardId}/state` (S2) returns a `revision` field that the client can use to initialize the polling cursor.

---

## Step 0: OpenAPI and Config (Constitution Gates — do first)

### 0a. Update `documentation/openapi.yaml`

Make the three changes documented in `contracts/operations-polling.md`:
1. Add `'410'` response for `CURSOR_INVALID` to the `getBoardOperations` operation.
2. Add `headRevision: integer` to `GetOperationsResponse.data` (mark required).
3. Add `default: 0` and a description to the `afterRevision` parameter.

### 0b. Extend `backend/src/config/limits.ts`

Add:

```ts
export const POLLING_MAX_PAGE_SIZE = parseInt(process.env.POLLING_MAX_PAGE_SIZE ?? '100', 10);
export const POLLING_HARD_TIMEOUT_MS = parseInt(process.env.POLLING_HARD_TIMEOUT_MS ?? '2000', 10);
export const POLLING_MIN_SAFE_REVISION = parseInt(process.env.POLLING_MIN_SAFE_REVISION ?? '0', 10);
```

These values drive validation and stale-cursor detection. No hardcoded literals in feature code.

---

## Step 1: Backend — Repository

**File**: `backend/src/repos/operations.repo.ts`

Add method:

```ts
async getAfterRevision(
  boardId: string,
  afterRevision: number,
  limit: number,
  tx?: PoolClient
): Promise<{ operations: OperationRow[]; headRevision: number }>
```

Implementation notes:
- Run two queries inside one transaction (or use a single query with a CTE):
  1. `SELECT revision FROM boards WHERE id = $1 AND status != 'deleted'` → `headRevision` (also validates board existence)
  2. `SELECT * FROM board_operations WHERE board_id = $1 AND board_revision > $2 ORDER BY board_revision ASC, id ASC LIMIT $3`
- If the board does not exist or `status = 'deleted'`, throw `BoardNotFoundError`.
- Return `{ operations, headRevision }`.
- Confirm `(board_id, board_revision)` index exists. If not, create it in a migration:

  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_board_operations_board_id_board_revision
  ON board_operations (board_id, board_revision);
  ```

---

## Step 2: Backend — Service

**File**: `backend/src/services/operations.service.ts`

Add method:

```ts
async getOperationsAfterRevision(
  boardId: string,
  afterRevision: number,
  limit: number
): Promise<GetOperationsResult>
```

Implementation notes:
- Clamp `limit` to `Math.min(limit, POLLING_MAX_PAGE_SIZE)` before calling the repo.
- Check `afterRevision < POLLING_MIN_SAFE_REVISION` → throw `CursorInvalidError` (returns 410).
- Call `operationsRepo.getAfterRevision(boardId, afterRevision, clampedLimit)`.
- Compute `nextCursor`: if `operations.length > 0`, return `String(operations.at(-1)!.boardRevision)`; else `null`.
- Return `{ operations, nextCursor, headRevision }`.

---

## Step 3: Backend — Zod Schema

**File**: `backend/src/schemas/operations.schemas.ts`

```ts
export const GetOperationsQuerySchema = z.object({
  afterRevision: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const OperationResponseSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  boardRevision: z.number().int(),
  actorType: z.enum(['user', 'agent', 'system']),
  operationType: z.string(),
  targetType: z.string(),
  targetId: z.string().uuid().nullable(),
  batchId: z.string().uuid().nullable(),
  payload: z.record(z.unknown()),
  inversePayload: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});

export const GetOperationsResponseSchema = z.object({
  operations: z.array(OperationResponseSchema),
  nextCursor: z.string().nullable(),
  headRevision: z.number().int(),
});
```

---

## Step 4: Backend — Controller

**File**: `backend/src/http/controllers/operations.controller.ts`

```ts
router.get('/boards/:boardId/operations', async (req, res) => {
  const { boardId } = req.params;
  const queryResult = GetOperationsQuerySchema.safeParse(req.query);

  if (!queryResult.success) {
    return res.status(400).json(validationErrorEnvelope(queryResult.error));
  }

  const { afterRevision, limit } = queryResult.data;

  try {
    const result = await operationsService.getOperationsAfterRevision(
      boardId, afterRevision, limit
    );
    return res.status(200).json({ data: result, error: null });
  } catch (err) {
    if (err instanceof BoardNotFoundError) {
      return res.status(404).json(boardNotFoundEnvelope());
    }
    if (err instanceof CursorInvalidError) {
      return res.status(410).json(cursorInvalidEnvelope(err.minSafeRevision));
    }
    throw err; // re-throw for global error handler
  }
});
```

**Verify**: Confirm the route is registered in `backend/src/http/router.ts` under the `/boards/:boardId` group.

---

## Step 5: Frontend — Extend Board Store

**File**: `frontend/src/stores/board-store.ts`

Add to the `sync` slice:

```ts
sync: {
  // ... existing fields ...
  pollingCursor: number | null;    // initialized from board.revision after hydration
  pollingStatus: 'idle' | 'polling' | 'error';
  stale: boolean;
}
```

Add actions:
- `setPollingCursor(revision: number)` — advance cursor after successful apply
- `setPollingStatus(status: 'idle' | 'polling' | 'error')` — track polling lifecycle
- `markStale()` — set `stale = true`, stops polling, triggers rehydrate
- `clearStale()` — reset after successful rehydrate

**Initialize cursor**: In the hydrate success handler, set `sync.pollingCursor = board.revision`.

---

## Step 6: Frontend — Polling Service

**File**: `frontend/src/services/operations-poller.ts`

```ts
class OperationsPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(boardId: string, store: BoardStore): void
  stop(): void
  private async poll(boardId: string, store: BoardStore): Promise<void>
}
```

**`poll()` logic**:

1. Read `pollingCursor` from store. If null, skip (hydrate not yet complete).
2. Set `pollingStatus = 'polling'`.
3. Call `GET /boards/{boardId}/operations?afterRevision={pollingCursor}&limit=100`.
4. On 200:
   a. If `headRevision > pollingCursor` and `operations.length === 0`: gap detected → `markStale()` → trigger rehydrate → return.
   b. Apply each operation in order to the confirmed store (see apply logic below).
   c. If `operations.length > 0`: advance `pollingCursor` to last operation's `boardRevision`.
   d. If `nextCursor` is non-null (more pages): immediately poll again (drain before waiting).
   e. Set `pollingStatus = 'idle'`.
5. On 410: `markStale()` → trigger rehydrate.
6. On 404: log error; stop polling (board no longer accessible).
7. On network/5xx: increment retry counter; after 3 failures, set `pollingStatus = 'error'` and surface error.

**Polling interval**:
- Active tab (Page Visibility API: `document.visibilityState === 'visible'`): 10 seconds
- Background tab: 30 seconds
- Stop on unmount; restart on tab refocus if previously stopped due to background threshold.

---

## Step 7: Frontend — Applying Operations to Confirmed Store

Each operation returned from the polling endpoint must be applied to the confirmed store in order. For MVP, the application logic is:

| `operationType` | Store action |
|----------------|-------------|
| `create_node` | Add node to `nodesById` |
| `update_node` | Merge patch into existing node |
| `delete_node` | Remove from `nodesById` (soft-delete marker) |
| `create_edge` | Add edge to `edgesById` |
| `update_edge` | Merge patch into existing edge |
| `delete_edge` | Remove from `edgesById` |
| `update_board` | Patch `board` metadata fields |
| `apply_agent_action_batch` | Apply each sub-action in batch order |
| unknown | Log warning; mark stale; rehydrate |

**Invariant check**: After applying all operations in a polling response, the local `board.revision` must equal the last operation's `boardRevision`. If not, mark stale.

---

## Step 8: Frontend — Sync Indicator (P4, optional)

**File**: `frontend/src/components/SyncIndicator/SyncIndicator.tsx`

A small, non-intrusive component rendered in the board header or toolbar:

- `pollingStatus === 'polling'`: show subtle spinner or "Syncing..." text
- `sync.stale === true`: show "Out of sync" badge with a "Refresh" action
- Otherwise: render nothing (no idle indicator)

Mount in the board layout only when the board is loaded.

---

## Step 9: Mount and Unmount Poller

**File**: board route component (e.g., `frontend/src/pages/BoardPage.tsx` or equivalent)

```ts
useEffect(() => {
  const poller = new OperationsPoller();
  poller.start(boardId, store);
  return () => poller.stop();
}, [boardId]);
```

Ensure the poller is stopped on route unmount to avoid ghost intervals.

---

## Testing Checklist

### Backend integration tests

- [ ] Seeded board with N operations: polling with `afterRevision=0&limit=N` returns all N operations in revision order
- [ ] Polling with `afterRevision` = last operation's revision returns empty operations and correct `headRevision`
- [ ] Polling with `limit=2` on a board with 10 operations paginates correctly; applying all pages gives same state as hydration
- [ ] Polling for a deleted board returns 404
- [ ] Polling for an archived board returns operations (read-only boards retain history)
- [ ] Invalid `afterRevision` (non-integer) returns 400 VALIDATION_ERROR
- [ ] When `POLLING_MIN_SAFE_REVISION > 0` and `afterRevision` is below it, returns 410 CURSOR_INVALID
- [ ] `headRevision` in every 200 response equals the board's current `revision` column value
- [ ] `nextCursor` equals the last returned operation's `boardRevision` as a string, or null when no operations

### Frontend integration tests

- [ ] Polling cycle applies operations and advances `pollingCursor`
- [ ] Empty polling response does not change `pollingCursor`
- [ ] 410 response triggers rehydrate and cursor reset
- [ ] Board reached by incremental polling equals board reached by fresh hydration (state comparison test)
- [ ] Poller stops on component unmount; no ghost intervals
- [ ] Stale indicator appears on 410 and clears after successful rehydrate
