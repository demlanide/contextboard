# Feature Specification: Operations Polling for Board Revisions

**Feature Branch**: `012-operations-polling`  
**Created**: 2026-03-17  
**Status**: Draft  
**Roadmap Slice**: S11

## Overview

Users who keep a board open need a way for the board to detect and incorporate changes that were committed to the server after the initial page load — without requiring a manual refresh or a real-time connection. This feature introduces a revision-based polling mechanism that lets the client request only the operations that occurred after its last known confirmed revision, apply them in sequence, and stay visually consistent with the backend's durable state.

The client polls periodically using a revision cursor. If the gap is too large or the cursor is invalid, the client falls back to a full board-state rehydrate. If the gap is small, the client applies operations incrementally into the same confirmed-state model that drives all other board interactions.

---

## Scope

### Included

- Backend endpoint for reading operations after a given revision: `GET /boards/{boardId}/operations`
- `afterRevision` query parameter for revision-based filtering
- `limit` query parameter with a maximum page size for MVP polling
- Deterministic, stable operation ordering by revision
- Client-side sync layer that periodically polls using `afterRevision`
- Stale-state detection when the cursor falls behind the minimum safe polling window
- Full-rehydrate fallback when incremental polling is not safe
- Lightweight sync-state signaling in the UI (e.g., stale indicator or background sync badge) where useful

### Excluded

- WebSocket or server-sent-event real-time sync
- Collaborative multi-user state propagation
- Operational transforms or conflict resolution
- Recovery and undo features (deferred to S12)
- Server-side cursor tokens or stateful pagination sessions

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Incremental board refresh after background inactivity (Priority: P1)

A user opens a board, works for a while, then leaves the tab inactive. When they return, they expect to see any new board state — including operations they may have committed in another tab or session — without having to manually reload the page.

**Why this priority**: This is the core user-visible outcome of the feature. The backend endpoint and client polling logic must both work correctly to deliver it. Without this, users encounter stale boards silently.

**Independent Test**: Seed a board at revision R with committed operations. Open the board in the client, observe that the confirmed revision is R. In a separate session, commit new mutations advancing the board to revision R+N. Trigger a polling cycle on the first client and verify that the board updates to reflect those new operations without a full page reload.

**Acceptance Scenarios**:

1. **Given** a board at confirmed revision R on the client, **When** new operations exist on the server at revisions R+1 through R+N and a polling cycle runs, **Then** the client receives exactly those operations in revision order and applies them to produce confirmed state equivalent to the server's state at revision R+N.

2. **Given** a client that just applied operations from a polling response up to revision R+N, **When** the client immediately polls again with `afterRevision=R+N`, **Then** the response is empty and no previously applied operations are returned.

3. **Given** a board where no new operations exist since the client's last known revision, **When** the client polls with that revision as `afterRevision`, **Then** the response contains an empty operation set and the client treats this as confirmation that its confirmed state is current.

---

### User Story 2 — Paginated incremental fetch for boards with many operations (Priority: P2)

A user returns to a board they have not opened for some time. Many operations exist since their last confirmed revision. The system should serve those operations in pages so neither the server nor the client is overwhelmed by a single large response.

**Why this priority**: Without pagination, a long-absent client requesting all operations since an early revision would produce unbounded response sizes. Pagination ensures the polling mechanism degrades gracefully under large backlogs.

**Independent Test**: Seed a board with more than `limit` operations after a known revision. Issue repeated polling calls with a small `limit` value, each using the last-returned operation's revision as the next `afterRevision`. Verify that applying all pages in sequence produces the same confirmed state as a fresh board-state hydration at the latest revision.

**Acceptance Scenarios**:

1. **Given** a board where N operations exist after revision R and N > limit, **When** the client calls the polling endpoint with `afterRevision=R` and `limit=L`, **Then** exactly L operations are returned (or fewer if N < L), ordered by revision, and each response contains enough information for the client to determine the next `afterRevision` value.

2. **Given** a sequence of paginated polling calls that each use the latest revision from the prior page as the next `afterRevision`, **When** all returned operations are applied in order across all pages, **Then** the resulting confirmed board state is identical to a fresh board-state hydration at the same final revision.

3. **Given** a request with `limit` greater than the system-defined maximum page size, **When** the server processes the request, **Then** the response is capped at the maximum page size without returning an error, and this behavior is reflected in the response metadata.

---

### User Story 3 — Stale-state detection and full rehydrate fallback (Priority: P3)

A user returns to a board after an extended offline period or after a server event that makes their stored revision unsafe for incremental polling. The system should detect this condition and transparently trigger a full board-state reload rather than allowing the client to apply operations against a stale or incompatible base.

**Why this priority**: Without this fallback, boards that fall too far behind could silently accumulate incorrect local state. The rehydrate path ensures that incremental polling never becomes a source of subtle drift or data loss.

**Independent Test**: Configure a client with a stored revision that is older than the backend's minimum safe polling window. Issue a polling request and verify that the response clearly indicates incremental polling is not possible. Then trigger a full board-state rehydration and verify that subsequent polling requests succeed from the rehydrated revision.

**Acceptance Scenarios**:

1. **Given** a client whose `afterRevision` is below the backend's minimum safe polling boundary, **When** the client calls the polling endpoint, **Then** the response returns a distinct error code indicating that a full rehydrate is required rather than returning partial or invalid operations.

2. **Given** a client that received a "rehydrate required" response, **When** the client performs a full board-state hydration and then resumes polling from the newly hydrated revision, **Then** incremental polling succeeds and no previously confirmed operations are re-delivered.

3. **Given** a client that receives unexpected behavior during an incremental polling cycle (gap in revisions, ordering inconsistency, or unrecognized response shape), **When** the client detects this condition, **Then** it falls back to a full rehydrate rather than attempting to continue incrementally with a potentially corrupt local state.

---

### User Story 4 — Sync-state visibility for the user (Priority: P4)

When the client is actively polling or has detected that its confirmed state may be stale, the user should see a subtle, non-intrusive signal that their board view may not be fully current, and that the system is working to reconcile it.

**Why this priority**: This improves trust in the product. Without any sync-state signal, users cannot distinguish between a fully current board and a stale one. However, this is low priority because the polling mechanism delivers value even if sync state is not surfaced visually.

**Independent Test**: Put the board into a stale state. Verify that a stale or syncing indicator becomes visible. After a successful reconciliation, verify that the indicator disappears.

**Acceptance Scenarios**:

1. **Given** a client whose confirmed revision is known to be behind the server's current revision, **When** the stale condition is detected, **Then** the user sees a non-disruptive indicator communicating that the board is syncing or may be out of date.

2. **Given** a client that has successfully completed a polling or rehydration cycle to the latest confirmed revision, **When** the sync cycle completes, **Then** any stale or syncing indicator clears without requiring user action.

---

### Edge Cases

- What happens when `afterRevision` equals or exceeds the server's current confirmed revision? (Expected: empty operation set, no error.)
- What happens when `afterRevision` is omitted? (Expected: defined behavior, either return all operations or return an error that documents the omission.)
- What happens when `boardId` refers to a board that does not exist or has been soft-deleted? (Expected: consistent `404` error matching other board endpoints.)
- What happens when `limit` is zero, negative, or non-numeric? (Expected: validation error with clear message.)
- What happens when `limit` exceeds the maximum page size? (Expected: response capped silently at the maximum.)
- What happens when the operations table for a board is empty? (Expected: empty operation set, no error.)
- How does the client handle a polling response where the returned operations are not contiguous with its last known revision? (Expected: detect gap, fall back to rehydrate.)
- What happens when an operation in a polling response references an entity (node, edge) that does not exist in local confirmed state? (Expected: client attempts best-effort entity reconstruction from operation payload; if reconstruction fails, logs a warning, skips that operation, and continues applying the rest — does not abort the batch.)
- What happens when a polling cycle is scheduled to fire while a durable mutation is currently in flight? (Expected: polling is paused; it resumes only after the mutation response has been received and reconciled into confirmed state.)
- What happens if the board is archived between polling requests? (Expected: polling still returns committed operations; new mutations are rejected elsewhere.)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a read-only endpoint for retrieving committed board operations, accepting a revision cursor and a page size as query parameters.
- **FR-002**: The endpoint MUST return only operations whose revision is strictly greater than the supplied `afterRevision` value, in stable deterministic ascending revision order.
- **FR-003**: The system MUST ensure that all operations returned from the polling endpoint reflect only committed, durable board state — no in-flight, rollback-pending, or synthesized operations may appear.
- **FR-004**: The system MUST enforce a maximum page size for any single polling response and MUST cap requests above this limit silently to the maximum without returning an error.
- **FR-005**: The system MUST support chained incremental polling: a client MUST be able to use the highest revision in a polling response as the `afterRevision` for the next request and advance monotonically to the latest confirmed revision.
- **FR-006**: The system MUST return a clear, distinct error response when a client's `afterRevision` is too old or otherwise outside the range the server can safely serve incrementally, so that the client can trigger a full board-state rehydrate instead of attempting further incremental polling.
- **FR-007**: When `afterRevision` is omitted, the system MUST default to `0` and return all committed operations from the start of the board's history, subject to the `limit` cap. This behavior MUST be documented in the API contract. In normal client usage the parameter is always provided (initialized from board-state hydration); the default-to-0 behavior exists for debugging and audit tooling only.
- **FR-008**: The system MUST define and document the behavior when `afterRevision` equals or exceeds the server's current confirmed revision, returning an empty operation set without error.
- **FR-009**: The system MUST validate that `boardId` refers to an accessible, non-deleted board and MUST return a consistent not-found response if the board does not exist or is unavailable.
- **FR-010**: The client sync layer MUST store a last-known confirmed revision and use it as the `afterRevision` anchor for each polling cycle.
- **FR-011**: The client MUST apply returned operations sequentially in the order provided by the server, advancing the confirmed revision only after each operation is successfully applied. If an individual operation references an entity not present in local confirmed state, the client MUST attempt best-effort reconstruction of that entity from the operation payload before applying; if reconstruction is not possible from the available payload data, the client MUST log a warning, skip that specific operation, and continue applying the remaining operations in the batch rather than aborting the entire sequence.
- **FR-012**: The client MUST detect stale or incompatible state (via server error response, revision gap, or ordering inconsistency) and MUST trigger a full board-state rehydrate rather than continuing incremental polling when stale state is detected.
- **FR-013**: Incremental polling MUST extend the existing confirmed-state model rather than introducing a parallel state system; applying a sequence of polled operations MUST always converge to the same confirmed board state as a fresh board-state hydration at the same final revision.
- **FR-014**: The system MUST NOT return operations that are not yet durably committed (no speculative or soft-pending operations in polling responses).
- **FR-015**: The system MUST log polling failures and unexpected server-side conditions in a way that supports debugging without exposing sensitive board content to end users.
- **FR-016**: The client MUST pause the polling loop while any durable mutation is in flight (sent to the server but not yet acknowledged). Polling MUST resume only after the in-flight mutation's response has been received and reconciled into confirmed state. This prevents the polling apply path and the mutation reconcile path from interleaving updates to confirmed state within the same cycle.

### Key Entities

- **Board**: A collaborative canvas whose durable state is anchored by a monotonically increasing revision number. Revision is the canonical sync primitive for all state changes.
- **Operation**: An immutable, ordered record of a single committed board mutation, associated with the board revision at the time it was applied. Operations contain enough metadata to apply them sequentially and to attribute them to an actor.
- **Revision Cursor**: The client's last known confirmed revision for a board, used as the `afterRevision` anchor. The cursor advances only after operations are successfully applied from a polling response or after a full rehydration.
- **Polling Cycle**: One complete round of requesting operations after the current cursor, applying any returned operations, and advancing the cursor. Polling cycles may be scheduled periodically by the client.
- **Stale State**: A condition where the client's confirmed revision is too far behind (or otherwise incompatible with) the server's committed history for safe incremental reconciliation. Resolution requires a full board-state rehydrate.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a polling cycle completes, the client's confirmed board state matches the server's durable state for the same revision in 100% of automated test comparisons — no data gaps, no duplicates, no out-of-order application.

- **SC-002**: A client starting from a valid revision cursor can advance to the latest confirmed server revision using only chained polling requests (no manual intervention) for boards with backlogs of up to 1,000 operations in at least 99% of test scenarios.

- **SC-003**: When a client's cursor falls outside the safe polling range, 100% of polling requests to that endpoint return a response that causes the client to initiate a full rehydrate — no client ever silently continues polling against stale state.

- **SC-004**: After a full rehydrate triggered by a stale-cursor response, the client successfully resumes incremental polling from the newly hydrated revision in 100% of test scenarios, without re-applying already-confirmed operations.

- **SC-005**: A board reached by incremental polling from an earlier revision is identical in all attributes to the same board reached by a fresh board-state hydration at the same final revision, verified in 100% of automated comparisons.

- **SC-006**: The polling mechanism introduces no detectable visual artifacts, duplicate entities, or missing entities on the board canvas in manual testing across representative board sizes (up to 500 nodes and 1,000 operations).

---

## Dependencies

- **S3 (Revision + Operations Foundation)**: The `board_operations` table and revision increment policy must be in place. The polling endpoint reads from this table; without it, there is nothing to return.
- **S3.5 (Frontend Foundation)**: The client store with `sync.lastSyncedRevision`, `sync.stale`, and the confirmed-state reconciliation pipeline must exist before the client sync layer can be added.
- **Board-State Hydration Endpoint** (`GET /boards/{boardId}/state`): The full rehydrate fallback path depends on this endpoint being stable and returning a current revision that the client can use as the next `afterRevision` cursor.

---

## Assumptions

- **Single-user MVP**: Polling is designed for single-user continuity (e.g., returning to an open tab after inactivity) rather than multi-user collaboration. Conflict resolution is out of scope.
- **Polling interval**: The client determines its own polling interval (e.g., every 10–30 seconds when the tab is active). The server does not push or schedule polls.
- **Maximum page size**: A system-level maximum page size cap applies to all polling responses (assumed 100 operations per page for MVP). Requests above this cap are silently capped, not rejected.
- **Minimum safe revision window**: For MVP, the backend is assumed to support incremental polling from any committed revision currently in the `board_operations` table. A "too old" cursor response is returned only if the backend enforces a compaction or retention policy — which is not planned for MVP but is accounted for by the stale-detection contract.
- **`afterRevision` omission behavior**: When omitted, the server defaults to `0` and returns all committed operations from the start of board history, subject to the `limit` cap. In MVP, the client always has a known revision from its initial hydration and never calls the polling endpoint without an `afterRevision` value; the default-to-`0` behavior is for debugging and audit tooling only, not normal polling usage.
- **No authentication in MVP**: The API has no auth layer; all boards are accessible. Board access validation is limited to existence and soft-delete status.
- **Ordering by revision**: Operations are ordered by `board_revision` ascending. Within the same revision (which should not occur, as each mutation batch produces exactly one revision), ordering by insertion ID or `created_at` is used as a tiebreaker.

---

## Clarifications

### Session 2026-04-14

- Q: When an operation in a polling response cannot be applied because it references an entity not present in local confirmed state, what should the client do? → A: Best-effort reconstruction from operation payload; if not possible, log warning and skip that operation — continue applying the rest of the batch (do not abort or rehydrate).
- Q: When `afterRevision` is omitted from a polling request, what should the server return? → A: Default to `0` — return all committed operations from the start of board history, subject to the `limit` cap.
- Q: Should the client polling loop pause while a durable mutation is in flight? → A: Yes — pause polling entirely while any mutation is in flight; resume only after the mutation response is received and reconciled into confirmed state.
