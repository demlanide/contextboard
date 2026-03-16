# Research: Board State Hydration

**Feature**: 002-board-state-hydration | **Date**: 2026-03-16

---

## R-001: Query Strategy for Board Hydration

### Context

The hydration endpoint must return board metadata, active nodes, active
edges, and chat thread metadata in a single HTTP response. The data
model documentation (section 19.1) provides reference query patterns.

### Decision

Use **separate indexed queries** executed sequentially within a single
request handler (no explicit transaction needed for read-only):

1. `SELECT * FROM boards WHERE id = $1 AND status <> 'deleted'`
2. `SELECT * FROM board_nodes WHERE board_id = $1 AND deleted_at IS NULL ORDER BY z_index ASC, created_at ASC`
3. `SELECT * FROM board_edges WHERE board_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`
4. `SELECT * FROM chat_threads WHERE board_id = $1`

### Rationale

- Matches the query patterns already documented in `documentation/data-model.md` section 19.1.
- Avoids complex JOINs that would produce cartesian products with many
  nodes × many edges.
- Each query uses an existing partial index (`idx_board_nodes_not_deleted`,
  `idx_board_edges_not_deleted`) for efficient active-entity filtering.
- Separate queries are easier to profile and optimize independently.
- No transaction is needed because this is a read-only snapshot at
  request time; slight timing differences between queries are acceptable
  for MVP single-user use.

### Alternatives Considered

- **Single JOIN query**: Rejected — produces N×M row explosion for
  nodes × edges; post-processing overhead exceeds separate query cost.
- **Materialized view**: Rejected — adds write-path complexity for a
  read-only endpoint; premature optimization per Constitution IX.
- **Transaction-wrapped reads**: Not needed for MVP single-user mode.
  If multi-user concurrent writes are added later, a READ COMMITTED
  snapshot is sufficient (PostgreSQL default).

---

## R-002: Board Nodes and Edges Table Migrations

### Context

The hydration endpoint queries `board_nodes` and `board_edges` tables,
but these tables are not created in S1 (Board Foundation). S4 (Nodes
CRUD) and S5 (Edges CRUD) implement the mutation endpoints, but the
hydration endpoint needs the tables to exist (even if empty) to
execute queries without errors.

### Decision

Create the `board_nodes` and `board_edges` table migrations as part of
this slice (S2). The migrations define the full DDL from
`documentation/data-model.md` sections 7.2 and 7.3, including all
indexes. This makes the hydration endpoint independently deployable
after S1 without requiring S4/S5 to be complete.

### Rationale

- Constitution VII (Vertical Slice Testability) requires each slice to
  be independently testable. The hydration endpoint cannot be tested
  without the tables existing.
- Creating tables without CRUD endpoints is safe — the tables will be
  empty until S4/S5 add mutation logic, which is the expected empty-
  board scenario already covered by User Story 2.
- Later slices (S4, S5) will reuse these tables and add their own
  service/controller/repo logic without needing to re-create the DDL.

### Alternatives Considered

- **Defer tables to S4/S5**: Rejected — would make S2 untestable in
  isolation and violate Constitution VII.
- **Conditional query with table existence check**: Rejected — fragile,
  adds runtime branching, and hides a missing prerequisite.

---

## R-003: Chat Thread Shape in State Response

### Context

The OpenAPI spec defines `GetBoardStateResponse.data.chatThread` using
the full `ChatThread` schema (id, boardId, metadata, createdAt,
updatedAt). However, the API narrative doc (section 6) shows a minimal
shape with only `id` and `boardId`. The feature spec (FR-006) says "at
minimum `id` and `boardId`."

### Decision

Return the **full ChatThread schema** as defined in the OpenAPI spec:
`id`, `boardId`, `metadata`, `createdAt`, `updatedAt`. The OpenAPI spec
is the authoritative contract per Constitution VI (Contract-First
Implementation).

### Rationale

- The OpenAPI `$ref` points to the full `ChatThread` schema, which is
  the binding contract.
- Returning the full schema avoids a future breaking change when chat
  features (S8) need thread metadata or timestamps.
- The API narrative doc shows a simplified example, not a restrictive
  definition.
- The spec says "at minimum," which is compatible with the full schema.

### Alternatives Considered

- **Minimal shape (id + boardId only)**: Rejected — diverges from the
  OpenAPI schema, which is the authoritative reference per Constitution
  VI.

---

## R-004: Missing Chat Thread Handling

### Context

The feature spec's edge cases section asks: "What happens when the chat
thread is missing due to a data integrity issue?" S1 guarantees that
board creation always auto-creates a chat thread in the same
transaction. A missing thread indicates a data integrity violation.

### Decision

If the chat thread is not found for a valid active/archived board,
return a **500 INTERNAL_ERROR** response. Do not return a partial state
envelope without the chat thread.

### Rationale

- A missing thread is a server-side data integrity failure, not a
  client error or expected condition.
- Returning partial state (without chatThread) would break the stable
  response envelope contract (FR-002, User Story 5).
- 500 is appropriate because the system is in an unexpected state that
  requires investigation.
- The error should be logged at ERROR level with the boardId for
  operational alerting.

### Alternatives Considered

- **Return partial response with null chatThread**: Rejected — violates
  FR-002 (response must contain chatThread as an object) and would
  force the frontend to special-case a missing thread.
- **Return 404 BOARD_NOT_FOUND**: Rejected — the board does exist; the
  thread is the missing entity. A misleading 404 would mask the real
  issue.

---

## R-005: Response Serialization — Snake Case to Camel Case

### Context

The database uses snake_case column names (`board_id`, `z_index`,
`deleted_at`, `created_at`). The API contract uses camelCase field
names (`boardId`, `zIndex`, `createdAt`). The serialization layer
must transform row data into the API shape.

### Decision

Transform database rows to camelCase API shape in the **repository
layer** return types. Each repo method returns typed objects with
camelCase field names. The service and controller layers work
exclusively with the API-shaped types.

### Rationale

- Keeps the transformation close to the data source boundary.
- Service and controller code never sees snake_case, reducing mapping
  errors.
- Consistent with the pattern established in S1 (boards.repo.ts).
- TypeScript interfaces for Node, Edge, Board, ChatThread match the
  OpenAPI schema field names.

### Alternatives Considered

- **Transform in service layer**: Rejected — creates an intermediate
  representation that duplicates type definitions.
- **Transform in controller/serializer**: Rejected — pushes mapping
  logic too far from the data source; services would work with
  inconsistent types.
