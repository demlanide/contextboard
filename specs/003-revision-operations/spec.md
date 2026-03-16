# Feature Specification: Revision + Operations Foundation

**Feature Branch**: `003-revision-operations`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Create the next feature spec for Context Board MVP: 003-revision-operations-foundation. Maps to roadmap slice S3."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Every Board Change is Recorded (Priority: P1)

A user makes a change to their board — renaming it, moving a node, or
applying an AI suggestion. Regardless of what type of change was made,
the system durably records the change as an operation entry before
confirming success. If the user later inspects the board's history or
a developer debugs an issue, every committed mutation is accounted for
in the operations log.

**Why this priority**: The operations log is the foundational
durability contract for the entire product. Without it, audit trails,
sync, undo, and debugging lose their basis. Every downstream feature
that mutates board state depends on operations being written reliably.

**Independent Test**: Can be fully tested by performing a board
metadata update (already available from S1) and verifying that an
operation row exists with the correct board id, revision, actor type,
operation type, target type, and payload. Delivers the first provable
durable audit trail.

**Acceptance Scenarios**:

1. **Given** an active board at revision 0, **When** the user updates
   the board title, **Then** the system writes an operation log entry
   with `operation_type` of `update_board`, `actor_type` of `user`,
   `target_type` of `board`, a payload containing before/after state,
   and `board_revision` matching the board's new revision value.

2. **Given** an active board, **When** a durable mutation succeeds,
   **Then** the operation rows for that mutation are committed in the
   same database transaction as the state change itself — not as a
   separate follow-up write.

3. **Given** an active board, **When** a durable mutation fails
   validation or encounters a database error, **Then** no operation
   log entries are written for that failed mutation.

4. **Given** an active board at revision 5, **When** three separate
   mutations succeed sequentially, **Then** the operations log
   contains entries at revisions 6, 7, and 8 respectively, and no
   revision is skipped or duplicated.

---

### User Story 2 — Board Revision Advances Predictably (Priority: P1)

A user performs several changes to their board over time. The board's
revision counter advances by exactly one for each successful committed
mutation batch, giving the frontend a reliable sync primitive. The
user can trust that the revision number always reflects the number of
committed change batches since the board was created.

**Why this priority**: Revision is the sync primitive that the
frontend uses to determine whether its local state is current. If
revision behavior is unpredictable, every sync-dependent feature
(polling, hydration baseline, conflict detection) breaks.

**Independent Test**: Can be fully tested by performing multiple board
mutations and verifying that the board's revision increments by
exactly one after each successful mutation, and does not change after
failed mutations or read-only operations.

**Acceptance Scenarios**:

1. **Given** an active board at revision 0, **When** the user
   successfully updates the board title, **Then** the board revision
   becomes 1.

2. **Given** an active board at revision 3, **When** a mutation
   request fails validation, **Then** the board revision remains 3.

3. **Given** an active board at revision 3, **When** the user
   performs a read-only operation (loading board state, listing boards),
   **Then** the board revision remains 3.

4. **Given** an active board at revision 3, **When** a future batch
   mutation containing 12 individual entity changes succeeds, **Then**
   the board revision becomes 4 (one increment for the entire
   committed batch, not one per entity).

5. **Given** an active board at revision 3, **When** a future AI
   apply operation with 5 action items succeeds, **Then** the board
   revision becomes 4 (one increment for the entire committed plan).

---

### User Story 3 — Retried Requests Produce Predictable Results (Priority: P2)

A user's browser loses connectivity briefly during a board change. The
frontend automatically retries the request using the same idempotency
key. The system recognizes the duplicate and returns the original
response without creating a second mutation, a second revision bump,
or duplicate operation log entries.

**Why this priority**: Idempotency is essential for safe retries in a
system where mutations have visible side effects (revision bumps,
operation logging). Without it, network failures could cause duplicate
board state or confusing revision jumps. However, it ranks below the
basic revision and operations mechanics because those must work
correctly first.

**Independent Test**: Can be fully tested by sending a board mutation
request with an idempotency key, then replaying the exact same request
with the same key, and verifying the response is identical and no
additional state change occurred.

**Acceptance Scenarios**:

1. **Given** a mutation request that succeeded with idempotency key
   `abc-123`, **When** the user replays the same request with the same
   key and same payload, **Then** the system returns the original
   stored response without performing a second mutation, without
   incrementing revision again, and without writing additional
   operation rows.

2. **Given** a mutation request that succeeded with idempotency key
   `abc-123`, **When** the user sends a different payload with the
   same key `abc-123`, **Then** the system returns a conflict error
   indicating idempotency key mismatch.

3. **Given** two concurrent mutation requests with different
   idempotency keys, **When** both target the same board, **Then**
   both succeed with sequential revision increments and independent
   operation log entries.

4. **Given** a mutation request that was never sent before, **When**
   the user sends it without an idempotency key, **Then** the
   mutation proceeds normally — idempotency is opt-in, not required.

5. **Given** an idempotency key that was used 25 hours ago, **When**
   the user sends a new request with the same key, **Then** the
   system treats it as a new request because the key has expired.

---

### User Story 4 — Operations Carry Meaningful Context (Priority: P2)

A developer or future audit tool inspects the operations log for a
board. Each operation entry contains enough context to understand what
changed, who caused it, and which mutation batch it belonged to. The
payload includes before/after state or entity snapshots as appropriate
for the operation type.

**Why this priority**: Operations are only useful if they carry
meaningful metadata. Without proper actor type, payload shape, and
batch grouping, the log becomes noise. This is lower priority than
basic operation writing because the system must first reliably write
operations before their content structure matters.

**Independent Test**: Can be fully tested by performing mutations with
different actor types (user-initiated vs. future agent-initiated) and
verifying that each operation row contains the correct actor type,
operation type, target type, target id, batch id (when applicable),
and structured payload.

**Acceptance Scenarios**:

1. **Given** a user-initiated board title update, **When** the
   operation is logged, **Then** the operation row contains
   `actor_type` = `user`, `operation_type` = `update_board`,
   `target_type` = `board`, `target_id` = the board's id, and a
   `payload` with before/after field values.

2. **Given** a future agent-initiated apply operation, **When** the
   operations are logged, **Then** all operation rows in the batch
   contain `actor_type` = `agent` and share the same `batch_id`.

3. **Given** a mutation that affects multiple entities in one batch
   (such as a node delete that cascades to edge soft-deletes),
   **When** the operations are logged, **Then** each affected entity
   gets its own operation row, and all rows in the batch share the
   same `board_revision` and `batch_id`.

4. **Given** any operation row, **When** its payload is inspected,
   **Then** the payload is a valid JSON object conforming to the
   documented payload shape for that operation type.

---

### User Story 5 — Failed Mutations Leave No Trace (Priority: P1)

A user sends a mutation request that fails — perhaps the board is
archived, a referenced entity doesn't exist, or validation rejects
the input. The system rolls back completely: the board revision does
not change, no operation log entries are written, and no partial
state is committed. The board remains exactly as it was before the
failed request.

**Why this priority**: This is the integrity counterpart to Stories 1
and 2. If the system can write operations for successful mutations
but also accidentally leaves traces of failed mutations, the entire
durability guarantee is undermined. This must be verified at the
same priority as the happy path.

**Independent Test**: Can be fully tested by sending a mutation
request that will fail (e.g., updating an archived board), then
querying the board revision and operations log to verify neither
changed.

**Acceptance Scenarios**:

1. **Given** an archived board at revision 6, **When** the user
   attempts to update the board title, **Then** the mutation is
   rejected, the board revision remains 6, and no new operation rows
   exist for the board at any revision above 6.

2. **Given** an active board at revision 3, **When** a future batch
   mutation fails because one item references a nonexistent entity,
   **Then** the board revision remains 3, no operation rows are
   written for any item in the batch, and no partial entity state
   is committed.

3. **Given** an active board, **When** a database error occurs
   during a mutation transaction, **Then** the entire transaction is
   rolled back including any tentatively written operation rows and
   any tentative revision bump.

---

### Edge Cases

- What happens when two mutation requests arrive concurrently for the
  same board? The system must serialize durable writes per board so
  that revisions remain monotonic and no operation rows interleave
  incorrectly.
- What happens when a mutation writes multiple operation rows but the
  transaction fails after some rows were inserted? The entire
  transaction rolls back — no partial operation rows persist.
- What happens when a board has revision `0` and the first mutation
  is a soft-delete? Per the board-foundation spec, soft-delete writes
  an operation log entry using the current revision (0) but does not
  increment revision.
- What happens when an idempotency key collision occurs across
  different endpoints? The scope key includes the HTTP method and path,
  so the same key string used on different endpoints is treated as
  distinct.
- What happens when the `inverse_payload` cannot be computed for an
  operation? The system should still write the operation with
  `inverse_payload` as null; the undo-ability of that operation is
  reduced but the audit trail is preserved.

## Clarifications

### Session 2026-03-16

- Q: What operation_type should board soft-delete and board archival use — `update_board`, or dedicated types like `delete_board`/`archive_board`? → A: Both soft-delete and archival use `update_board`. The payload carries before/after status (e.g., `{"before": {"status": "active"}, "after": {"status": "deleted"}}`). No new operation types are needed.
- Q: Should board creation write an operation log entry (e.g., `create_board` at revision 0)? → A: No. Board creation is the genesis event, not a mutation of existing state. Revision starts at 0 meaning "no mutations yet." The operations log begins with the first actual change to the board.
- Q: Should single-entity mutations carry a `batch_id`, or is it null when only one entity is affected? → A: Single-entity mutations have `batch_id` = null. The `batch_id` is only set for multi-entity batches (e.g., node delete + cascading edge deletes, AI apply with multiple actions). Presence of `batch_id` signals a grouped operation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every successful durable board mutation MUST write at
  least one operation row to the `board_operations` table within the
  same database transaction as the state change.
- **FR-002**: Every successful durable mutation batch MUST increment
  the board's `revision` field by exactly one, regardless of how many
  individual entity changes the batch contains.
- **FR-003**: All operation rows written for a single committed
  mutation batch MUST share the same `board_revision` value — the
  board's new revision after the increment.
- **FR-004**: Failed mutations (validation failures, domain errors,
  database errors) MUST NOT increment board revision and MUST NOT
  write any operation log entries. The transaction MUST roll back
  completely.
- **FR-005**: Read-only operations (board listing, state hydration,
  metadata reads, chat reads) MUST NOT increment board revision or
  write operation log entries. Board creation MUST NOT write an
  operation log entry; revision 0 represents the genesis state before
  any mutations.
- **FR-006**: Suggest-only agent flows MUST NOT increment board
  revision or write board-state operation log entries.
- **FR-007**: Each operation row MUST contain: `id` (UUID), `board_id`,
  `board_revision`, `actor_type`, `operation_type`, `target_type`,
  `target_id` (nullable), `batch_id` (nullable), `payload` (JSONB),
  `inverse_payload` (nullable JSONB), and `created_at`.
- **FR-008**: The `actor_type` field MUST be one of: `user`, `agent`,
  or `system`.
- **FR-009**: The `operation_type` field MUST be one of the supported
  operation types: `create_node`, `update_node`, `delete_node`,
  `restore_node`, `create_edge`, `update_edge`, `delete_edge`,
  `create_asset`, `update_board`, `apply_agent_action_batch`,
  `create_snapshot`.
- **FR-010**: The `target_type` field MUST be one of: `board`, `node`,
  `edge`, `asset`, `chat`, `layout`, `snapshot`.
- **FR-011**: When a mutation affects multiple entities within one
  batch, each affected entity MUST receive its own operation row,
  and all rows MUST share the same `batch_id`. Single-entity
  mutations MUST set `batch_id` to null; the presence of a
  `batch_id` signals a grouped multi-entity operation.
- **FR-012**: The service layer MUST bump the board revision once at
  the end of the mutation flow — after all entity writes and
  validation are complete, but before the transaction commits.
- **FR-013**: Operation rows MUST be created by the service layer
  through a normalized operation factory, not ad-hoc in individual
  repository methods.
- **FR-014**: The operation `payload` MUST conform to the documented
  payload shape for each operation type (e.g., `create_node` includes
  the created node data; `update_node` includes before/after diffs;
  `delete_edge` includes the edge id). Board status transitions
  (soft-delete and archival) MUST use `update_board` as the operation
  type, with the payload carrying before/after status values.
- **FR-015**: The `inverse_payload` field SHOULD contain the
  information needed to reverse the operation when available. It MAY
  be null when inverse computation is not practical.
- **FR-016**: Board revision MUST be monotonically increasing and MUST
  never decrease for a given board.
- **FR-017**: System MUST support idempotent mutation handling for
  POST endpoints via an `Idempotency-Key` request header.
- **FR-018**: When the same idempotency key and same payload are
  replayed, the system MUST return the originally stored response
  without performing a second mutation, incrementing revision, or
  writing additional operations.
- **FR-019**: When the same idempotency key is reused with a different
  payload, the system MUST return a 409 IDEMPOTENCY_CONFLICT error.
- **FR-020**: The idempotency scope key MUST incorporate HTTP method,
  request path, and the idempotency key value to prevent collisions
  across different endpoints.
- **FR-021**: Idempotency key records MUST expire after a configured
  retention period (default 24 hours).
- **FR-022**: Idempotency MUST be opt-in — requests without an
  `Idempotency-Key` header MUST proceed normally without idempotency
  checks.
- **FR-023**: Durable writes for a single board MUST be serialized
  (e.g., via per-board advisory lock within the transaction) to
  guarantee monotonic revision ordering and prevent interleaving
  of operation rows from concurrent requests.
- **FR-024**: The `board.updated_at` timestamp MUST be updated in
  the same transaction as the revision bump for every successful
  durable mutation.

### Key Entities

- **Board Operation**: An append-only log entry representing one
  atomic change within a committed mutation batch. Key attributes:
  id, board id, board revision, actor type, operation type, target
  type, target id, batch id, payload, inverse payload, timestamp.
  Operations are the primary durability and audit primitive.
- **Board Revision**: A monotonically increasing integer on the board
  entity that advances by exactly one per committed mutation batch.
  Serves as the sync primitive for frontend state and polling.
- **Idempotency Key Record**: A stored record mapping a scope key to
  a request fingerprint and cached response. Key attributes: id,
  scope key (unique), request fingerprint, response status code,
  response body, created timestamp, expiry timestamp. Used to
  deduplicate retried POST requests safely.
- **Batch ID**: A UUID grouping all operation rows that belong to a
  single committed multi-entity mutation batch. Null for single-entity
  mutations. Its presence signals that the operation is part of a
  grouped change and enables tracing multi-entity mutations as a unit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every successful board mutation produces exactly one
  revision increment and at least one operation log entry — verified
  across all mutation types (board update, future node/edge CRUD,
  future batch, future AI apply).
- **SC-002**: Failed mutations leave the board revision unchanged and
  produce zero operation log entries — verified across validation
  failures, domain errors, and simulated database errors.
- **SC-003**: For batch mutations containing N entity changes, the
  board revision increments by exactly one (not N), and all N
  operation rows share the same revision and batch id.
- **SC-004**: Replaying an idempotent request with the same key and
  payload returns the identical response and produces no additional
  state changes.
- **SC-005**: Replaying an idempotent request with the same key but
  a different payload returns a conflict error.
- **SC-006**: Concurrent mutations to the same board produce
  sequential, non-overlapping revision numbers with no gaps.
- **SC-007**: Operation payloads are valid JSON conforming to the
  documented shape for their operation type — verified for at least
  `update_board`, `create_node`, `update_node`, and `delete_node`
  operation types.
- **SC-008**: All relevant test matrix cases (T028, T029, T046, T047,
  T048) pass.

## Scope Exclusions

The following are explicitly out of scope for this feature and belong
to later roadmap slices:

- Full node CRUD behavior details — belongs to S4
- Edge CRUD behavior details — belongs to S5
- Asset upload and image nodes — belongs to S7
- Chat message send flow — belongs to S8
- Agent suggest/apply flow orchestration — belongs to S9/S10
- Operations polling endpoint (`GET /boards/{boardId}/operations`) —
  belongs to S11
- Batch node mutation endpoint — belongs to S6
- Snapshot creation policy — belongs to S12
- Undo/recovery flows — belongs to S12

## Assumptions

- Board foundation (S1) is already implemented, providing board
  create, update, delete, and archive flows. This feature integrates
  revision and operations behavior into those existing flows. Board
  creation itself does not write an operation; the operations log for
  a board begins with its first mutation (e.g., title update, archive,
  or soft-delete).
- Board state hydration (S2) is already implemented and returns the
  board's current revision as `lastOperationRevision`. This feature
  does not modify the hydration endpoint.
- The `board_operations` and `idempotency_keys` tables follow the
  DDL defined in the data model documentation.
- Node and edge mutations do not yet exist when this feature is first
  delivered. The revision and operations infrastructure must be
  designed so that later slices (S4, S5, S6) can use it without
  rework.
- The operation factory and revision policy modules are implemented
  as reusable domain-layer components, not embedded in individual
  controller or repository code.
- Per the board-foundation spec (S1), board soft-delete writes an
  operation log entry with the board's current pre-delete revision
  but does NOT increment revision. Board archival (active → archived)
  DOES increment revision and writes an operation log entry. Both
  transitions use `update_board` as the operation type; the payload
  distinguishes the transition via before/after status values.
- Idempotency key retention of 24 hours is the default; this is
  configurable.
- Per-board write serialization in MVP uses PostgreSQL advisory locks
  or equivalent transaction-level locking.
