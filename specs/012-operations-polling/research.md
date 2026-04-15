# Research Summary: 012-Operations Polling

## Phase 0 Decisions

---

### Decision 1: Cursor format — integer revision, not an opaque token

**Decision**: Use the integer `boardRevision` of the last returned operation directly as the next polling cursor. The `afterRevision` query parameter accepts an integer. The response's `nextCursor` field returns the last operation's `boardRevision` as a string (matching the existing OpenAPI type), or `null` when the client has reached the head of the log.

**Rationale**: The `boardRevision` is already the canonical sync primitive per the constitution. Using it directly as the cursor avoids the opacity and decoding complexity of an opaque token. The client already tracks `lastSyncedRevision` as an integer in the Zustand store; aligning the cursor to the same integer makes the polling loop trivially simple: `afterRevision = sync.lastSyncedRevision`.

**Alternatives considered**:
- Opaque base64-encoded cursor token: Rejected. Adds encoding/decoding overhead and obscures debuggability without benefit — the only meaningful ordering dimension is `boardRevision`.
- Timestamp-based cursor: Rejected. Timestamps are not monotonically unique when operations share a batch (same `created_at` range), making ordering ambiguous.

---

### Decision 2: Add `headRevision` to the polling response

**Decision**: Extend the `GetOperationsResponse` data body with a `headRevision` integer field representing the board's current confirmed revision at the time the polling request is served.

**Rationale**: Without `headRevision`, a client that receives an empty operations list cannot distinguish between "the board is genuinely at my revision" and "there are operations but they weren't returned for some reason." `headRevision` also lets the client detect stale state in the single-client MVP case: if `headRevision > afterRevision` but `operations` is empty, something is wrong and the client should rehydrate. This is a low-cost addition that materially improves the reliability of stale-state detection.

**Alternatives considered**:
- Relying solely on `nextCursor = null` to signal caught-up state: Rejected. Provides no independent signal of the board's current confirmed revision; leaves the client unable to self-diagnose a lag condition.
- Separate `GET /boards/{boardId}` call to get the current revision: Rejected. An additional round-trip just to validate sync currency is wasteful and creates a race window.

**OpenAPI impact**: Add `headRevision: integer` to `GetOperationsResponse.data` properties. Mark as required.

---

### Decision 3: Behavior when `afterRevision` is omitted

**Decision**: If `afterRevision` is omitted, the endpoint defaults to `afterRevision = 0` and returns all committed operations from the beginning of the board's history, subject to the `limit` cap. This behavior is documented in the API reference.

**Rationale**: Returning all history from revision 0 is safe, deterministic, and consistent with the "strictly greater than `afterRevision`" semantics (all revisions are > 0). It also avoids a 400 error path for a query that is technically valid.

**Practical note**: In normal client usage, `afterRevision` is always provided because the client initializes its cursor from the board-state hydration response. The omitted case exists mainly for debugging and audit tooling.

**Alternatives considered**:
- Return 400 VALIDATION_ERROR when `afterRevision` is omitted: Rejected. The parameter has a sensible default; forcing the caller to always supply it adds friction for debugging use cases without safety benefit.
- Default to current board revision (return empty set when omitted): Rejected. This silently skips all history, which is counterintuitive and makes audit use cases impossible without an additional parameter.

---

### Decision 4: Stale cursor detection — 410 Gone + CURSOR_INVALID error code

**Decision**: When the server cannot safely serve operations incrementally from a client's `afterRevision` (e.g., due to future compaction or retention policies), the endpoint returns `410 Gone` with error code `CURSOR_INVALID` and a message directing the client to perform a full rehydrate.

**Rationale**: In MVP, the `board_operations` log is append-only with no compaction or retention cutoff, so a 410 will never fire in practice. However, defining the contract now ensures the client handles it correctly and the server can activate it without breaking clients in a future phase. `410 Gone` is semantically correct — the cursor's validity window has passed — and is more accurate than `409 Conflict`.

**MVP note**: The backend will implement the 410 path with a configurable `POLLING_MIN_SAFE_REVISION_WINDOW` in `config/limits.ts` (initially set to 0, meaning all revisions are safe). When set to a positive value in a future phase, it activates stale-cursor rejection.

**Alternatives considered**:
- 409 Conflict: Plausible but semantically weaker; 409 implies the request could succeed with modification, whereas 410 means the resource (cursor validity) is permanently gone.
- 422 VALIDATION_ERROR: Rejected. A stale cursor is not a validation failure; the request is syntactically and semantically valid but the server cannot serve it.
- Silent empty response with a `stale: true` flag: Rejected. Risks clients silently staying at a stale revision if they mishandle or ignore the flag.

---

### Decision 5: No new database tables — reads from existing `board_operations`

**Decision**: The feature reads from the existing `board_operations` table (introduced in S3) with a single indexed query: `WHERE board_id = $1 AND board_revision > $2 ORDER BY board_revision ASC, id ASC LIMIT $3`. No migrations or schema changes are needed.

**Rationale**: The `board_operations` table already has `board_id` and `board_revision` columns. An existing index or a new composite index `(board_id, board_revision)` makes the query efficient. Adding `id ASC` as a tiebreaker within the same revision (which should not occur in practice) ensures a stable total order.

**Index requirement**: Confirm that `board_operations` has an index on `(board_id, board_revision)`. If not, add one as part of this feature's migration file. This is a non-breaking additive change.

**Alternatives considered**:
- Dedicated `board_operation_cursors` table for server-side cursor state: Rejected. Stateless server-side polling (cursor carried by the client) is simpler, scales trivially, and requires no session management.
- Materialized view for pre-paginated operations: Rejected. Premature optimization; the simple indexed query is fast enough at MVP scale.

---

### Decision 6: Polling interval — client-controlled, not server-pushed

**Decision**: The client determines its own polling interval. Recommended defaults: 10 seconds when the board tab is active and in focus, 30 seconds when the tab is in the background or not focused. No server-side push or SSE is involved.

**Rationale**: Server-side push (WebSocket, SSE) is explicitly excluded from this feature's scope. Client-controlled intervals are simpler to implement, test, and tune. The Page Visibility API and focus events can be used to reduce background polling frequency without additional server coordination.

**Alternatives considered**:
- Server-controlled polling interval via a response header: Plausible but adds server-side complexity and introduces state coordination that isn't needed for a single-user MVP.
- Fixed single interval regardless of tab visibility: Simpler but wastes resources when the tab is backgrounded; the Page Visibility API check adds minimal code.

---

### Decision 7: Client sync layer — extends existing board store, not a second store

**Decision**: Polling state (`pollingCursor`, `pollingStatus`, `stale`) is added to the existing Zustand `sync` slice of the board store. The polling loop lives in a new `operations-poller.ts` service module that is started when the board route mounts and stopped when it unmounts.

**Rationale**: The `frontend-state-sync.md` document explicitly states: "Even when polling is added later, the main confirmed store shape should stay the same. Polling should just become another way to feed durable diffs into the same reconciliation logic." A second store or parallel confirmed-state model violates FR-013 (incremental polling must extend, not replace, the confirmed-state model) and the constitution's Principle I.

**Alternatives considered**:
- Separate polling store: Rejected. Creates a second state system that violates the confirmed-state-model invariant and introduces reconciliation ambiguity between the two stores.
- In-component polling with `useEffect`: Rejected. Polling must survive component remounts and be shared across the board screen without duplicating intervals.

---

### Summary of OpenAPI changes required (addressing Constitution Gate VI)

The existing `GET /boards/{boardId}/operations` path in `openapi.yaml` needs these additions before implementation:

1. Add `410` response for stale cursor:
   ```yaml
   '410':
     description: Cursor no longer valid — full rehydrate required
     content:
       application/json:
         schema:
           $ref: '#/components/schemas/ErrorEnvelope'
         example:
           data: null
           error:
             code: CURSOR_INVALID
             message: "afterRevision is outside the safe polling window; perform a full board-state rehydrate"
   ```

2. Add `headRevision` to `GetOperationsResponse.data`:
   ```yaml
   headRevision:
     type: integer
     description: Current confirmed board revision at the time this response was generated
   ```
   Mark as required alongside `operations` and `nextCursor`.

3. Add inline description to the `afterRevision` parameter documenting default-to-0 behavior when omitted.
