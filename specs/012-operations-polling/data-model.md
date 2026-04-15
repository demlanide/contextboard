# Data Model: 012-Operations Polling

## Overview

This feature introduces **no new database tables or migrations** beyond what S3 (Revision + Operations Foundation) delivered. The polling endpoint is a read path over the existing `board_operations` and `boards` tables.

The only schema work is confirming or adding a composite index on `board_operations(board_id, board_revision)` to make the polling query efficient. This is a non-breaking additive change.

---

## Existing Tables Used

### `boards`

Used to:
- Validate that `boardId` exists and is not soft-deleted (`status != 'deleted'`)
- Read `revision` (the current confirmed board revision) for inclusion as `headRevision` in the response

Relevant columns:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key; maps to `boardId` path parameter |
| `status` | text (enum) | `active`, `archived`, `deleted`; endpoint rejects `deleted` boards |
| `revision` | bigint | Monotonically increasing; returned as `headRevision` in polling response |

---

### `board_operations`

The primary data source for the polling endpoint. Append-only mutation log.

All columns returned in the polling response:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Operation row primary key; used as tiebreaker within a revision |
| `board_id` | UUID | FK → `boards.id`; filter column in polling query |
| `board_revision` | bigint | The board revision at the time this operation was committed; filter and ordering column |
| `actor_type` | text (enum) | `user`, `agent`, `system` |
| `operation_type` | text (enum) | `create_node`, `update_node`, `delete_node`, `create_edge`, etc. |
| `target_type` | text (enum) | `board`, `node`, `edge`, `asset`, `chat`, `layout`, `snapshot` |
| `target_id` | UUID (nullable) | ID of the affected entity |
| `batch_id` | UUID (nullable) | Groups operations belonging to the same committed batch |
| `payload` | jsonb | Operation-specific change data |
| `inverse_payload` | jsonb (nullable) | Reverse payload for future undo support |
| `created_at` | timestamptz | When the operation row was written |

---

## Index Requirement

The polling query is:

```sql
SELECT *
FROM board_operations
WHERE board_id = $1
  AND board_revision > $2
ORDER BY board_revision ASC, id ASC
LIMIT $3
```

This requires an efficient lookup on `(board_id, board_revision)`.

**Action**: Confirm that an index on `(board_id, board_revision)` exists in the S3 migration. If not, add a migration as part of this feature:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_board_operations_board_id_board_revision
ON board_operations (board_id, board_revision);
```

`CONCURRENTLY` ensures the migration is non-blocking on a live table.

---

## Client-Side State (Zustand store — not persisted to DB)

These fields are added to the existing `BoardStore.sync` slice. They live in memory and are reset on route remount or full rehydrate.

| Field | Type | Description |
|-------|------|-------------|
| `pollingCursor` | `number \| null` | Last confirmed revision the client has applied via polling; initialized from board hydration; advances after each successful polling apply |
| `pollingStatus` | `'idle' \| 'polling' \| 'error'` | Current state of the polling loop |
| `stale` | `boolean` | Set to `true` when stale-cursor (410) or inconsistency detected; triggers rehydrate |

---

## Response Shape (as consumed by client)

The extended `GetOperationsResponse` body after Phase 1 OpenAPI changes:

```json
{
  "data": {
    "operations": [
      {
        "id": "uuid",
        "boardId": "uuid",
        "boardRevision": 15,
        "actorType": "user",
        "operationType": "create_node",
        "targetType": "node",
        "targetId": "uuid",
        "batchId": null,
        "payload": {},
        "inversePayload": null,
        "createdAt": "2026-04-14T10:00:00.000Z"
      }
    ],
    "nextCursor": "15",
    "headRevision": 20
  },
  "error": null
}
```

**`nextCursor`**: String representation of the highest `boardRevision` in the returned operations, or `null` if no operations were returned (client is caught up or the page was the last one). Client converts to integer for the next `afterRevision` query parameter.

**`headRevision`**: The board's current confirmed revision at response time. Allows the client to detect stale state: if `headRevision > afterRevision` and `operations` is empty, the board has advanced but no operations were returned — which indicates a possible gap and should trigger a rehydrate.

---

## Invariants

1. Every operation in a polling response has `boardRevision > afterRevision`.
2. Operations are ordered `(boardRevision ASC, id ASC)` — stable and deterministic.
3. `headRevision` ≥ max(`boardRevision`) across all returned operations.
4. `nextCursor` is always the last operation's `boardRevision` as a string, or `null`.
5. Applying all returned operations in order must produce the same confirmed state as a fresh board-state hydration at the same final revision (FR-013 invariant).
6. Deleted boards (`status = 'deleted'`) return 404; archived boards return operations normally (read-only boards retain history).
