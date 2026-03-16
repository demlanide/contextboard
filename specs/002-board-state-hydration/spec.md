# Feature Specification: Board State Hydration

**Feature Branch**: `002-board-state-hydration`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Create the next feature spec for Context Board MVP: 002-board-state-hydration. Maps to roadmap slice S2."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Load a Board Workspace (Priority: P1)

A user navigates to a board and the system loads the complete workspace
in one request. The response contains the board metadata, all active
nodes, all active edges, the board's chat thread metadata, and the
current revision marker. The frontend uses this response to render the
full canvas and set its sync baseline.

**Why this priority**: This is the entire purpose of the feature.
Without a stable hydration endpoint the frontend cannot render any
board content. Every downstream editing, chat, and AI feature depends
on reliable initial load.

**Independent Test**: Can be fully tested by creating a board (and
optionally adding nodes and edges via direct database seeding or prior
slice endpoints), calling the state endpoint, and verifying the
returned envelope contains the correct board, nodes, edges, chat
thread, and revision marker.

**Acceptance Scenarios**:

1. **Given** an active board with two nodes and one edge, **When** the
   user requests `GET /boards/{boardId}/state`, **Then** the system
   returns a 200 response containing the board object, both nodes, the
   edge, the chat thread metadata, and a `lastOperationRevision` equal
   to the board's current revision.

2. **Given** an active board with three nodes (one of which is
   soft-deleted) and two edges (one connecting to the deleted node,
   also soft-deleted), **When** the user requests the board state,
   **Then** the response includes only the two active nodes and one
   active edge. The soft-deleted node and edge are excluded.

3. **Given** an active board at revision 7, **When** the user requests
   the board state, **Then** `lastOperationRevision` is `7`.

4. **Given** an active board, **When** the user requests the board
   state, **Then** the response includes a `chatThread` object with
   `id` and `boardId` fields matching the board's auto-created thread.

---

### User Story 2 — Load a Newly Created (Empty) Board (Priority: P1)

A user creates a fresh board and immediately navigates to it. The
system returns a valid state envelope with empty node and edge
collections, confirming the board is ready for use.

**Why this priority**: Same as Story 1 — empty-board hydration is the
first thing a user encounters after board creation and must work
correctly from day one.

**Independent Test**: Can be fully tested by creating a board and
immediately calling the state endpoint, verifying the response shape
is valid with zero nodes and zero edges.

**Acceptance Scenarios**:

1. **Given** a newly created board with no nodes or edges, **When**
   the user requests `GET /boards/{boardId}/state`, **Then** the
   system returns a 200 response with the board object, an empty
   `nodes` array, an empty `edges` array, the chat thread metadata,
   and `lastOperationRevision` equal to the board's initial revision
   (0).

2. **Given** a newly created board, **When** the user requests the
   board state, **Then** the board object contains status `active`,
   default viewport state, default settings, and an empty summary.

---

### User Story 3 — Deleted Board Returns Not Found (Priority: P2)

A user attempts to load a board that has been soft-deleted. The system
responds with a not-found error, treating the board as if it does not
exist in normal usage.

**Why this priority**: Correctly hiding deleted boards from state
hydration is critical for data consistency and user trust, but is
only testable after the basic happy-path hydration works.

**Independent Test**: Can be fully tested by creating a board,
soft-deleting it, and verifying the state endpoint returns 404
BOARD_NOT_FOUND.

**Acceptance Scenarios**:

1. **Given** a board that has been soft-deleted, **When** the user
   requests `GET /boards/{boardId}/state`, **Then** the system returns
   a 404 response with error code `BOARD_NOT_FOUND`.

2. **Given** a board id that has never existed, **When** the user
   requests `GET /boards/{boardId}/state`, **Then** the system returns
   a 404 response with error code `BOARD_NOT_FOUND`.

---

### User Story 4 — Archived Board State is Readable (Priority: P3)

A user navigates to an archived board. The system returns the full
state envelope, allowing the user to view the board in read-only mode.
The board object shows status `archived`.

**Why this priority**: Archival read access is important for reference
boards but is lower priority than active board hydration and
deleted-board exclusion.

**Independent Test**: Can be fully tested by creating a board,
transitioning it to archived status, and verifying the state endpoint
returns the full envelope with status `archived`.

**Acceptance Scenarios**:

1. **Given** an archived board with nodes and edges, **When** the user
   requests `GET /boards/{boardId}/state`, **Then** the system returns
   a 200 response with the complete state envelope and the board
   object shows status `archived`.

2. **Given** an archived board, **When** the user requests its state,
   **Then** the `lastOperationRevision` reflects the board's current
   revision at the time of archival.

---

### User Story 5 — State Response Shape is Stable (Priority: P2)

The frontend relies on one stable hydration contract. The state
endpoint must return a consistent response envelope regardless of how
many or how few entities exist on the board. The shape of the response
does not change based on board content — only the contents of the
arrays vary.

**Why this priority**: A stable contract is essential for frontend
development to proceed in parallel. Inconsistent shapes would break
client parsing and UI rendering.

**Independent Test**: Can be fully tested by comparing the response
shape across boards with different content profiles (empty, one node,
many nodes and edges) and verifying all responses conform to the same
envelope structure.

**Acceptance Scenarios**:

1. **Given** any active board (empty or populated), **When** the user
   requests `GET /boards/{boardId}/state`, **Then** the response
   always contains exactly these top-level keys in the data envelope:
   `board` (object), `nodes` (array), `edges` (array), `chatThread`
   (object), and `lastOperationRevision` (integer).

2. **Given** a board with mixed node types (sticky, text, image,
   shape), **When** the user requests the board state, **Then** all
   nodes are returned in the `nodes` array with their full schema
   regardless of type.

3. **Given** a board where nodes and edges exist but all have been
   soft-deleted, **When** the user requests the board state, **Then**
   the response contains empty `nodes` and `edges` arrays (not null,
   not absent).

---

### Edge Cases

- What happens when the board id in the URL is a malformed UUID? The
  system should return a 400 error before executing domain logic.
- What happens when a board has 5,000 nodes (near the soft limit)?
  The state endpoint should still return successfully within
  acceptable latency.
- What happens when nodes reference a parent node that has been
  soft-deleted? The child nodes without a deleted parent should still
  be returned; their `parentId` may reference a node that is no longer
  in the active set.
- What happens when an edge references a source or target node that
  has been soft-deleted? The edge should also be soft-deleted (by the
  node-delete operation in a prior slice) and therefore excluded from
  the state response.
- What happens when the chat thread is missing due to a data
  integrity issue? The system should return an error rather than a
  partial response without the chat thread.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `GET /boards/{boardId}/state`
  endpoint that returns the full active board state in a single
  request.
- **FR-002**: The state response envelope MUST contain exactly these
  fields in the `data` object: `board` (object), `nodes` (array),
  `edges` (array), `chatThread` (object), and `lastOperationRevision`
  (integer).
- **FR-003**: The `board` field MUST contain the complete board
  metadata including id, title, description, status, viewportState,
  settings, summary, revision, createdAt, and updatedAt.
- **FR-004**: The `nodes` array MUST contain only non-deleted nodes
  belonging to the requested board, ordered by z_index ascending then
  createdAt ascending.
- **FR-005**: The `edges` array MUST contain only non-deleted edges
  belonging to the requested board, ordered by createdAt ascending.
- **FR-006**: The `chatThread` field MUST contain the board's
  auto-created chat thread with at minimum `id` and `boardId`.
- **FR-007**: The `lastOperationRevision` field MUST equal the board's
  current revision value.
- **FR-008**: For a newly created board with no nodes or edges, the
  `nodes` and `edges` arrays MUST be empty arrays (not null, not
  omitted).
- **FR-009**: System MUST return 404 with error code `BOARD_NOT_FOUND`
  when the board id does not exist or the board has status `deleted`.
- **FR-010**: System MUST return the full state envelope for archived
  boards (status `archived`) with a 200 response.
- **FR-011**: System MUST validate the board id path parameter as a
  valid UUID and return 400 for malformed ids before executing any
  domain logic.
- **FR-012**: The state endpoint MUST be a read-only operation — it
  MUST NOT increment board revision, create operation log entries, or
  mutate any data.
- **FR-013**: System MUST use the standard error response envelope
  with `code`, `message`, and optional `details` for error responses
  from this endpoint.
- **FR-014**: Soft-deleted nodes (where `deleted_at` is not null) MUST
  be excluded from the `nodes` array regardless of any other attribute.
- **FR-015**: Soft-deleted edges (where `deleted_at` is not null) MUST
  be excluded from the `edges` array regardless of any other attribute.

### Key Entities

- **Board**: The top-level workspace container. Returned as a complete
  metadata object in the state response. Key attributes: id, title,
  description, status, viewportState, settings, summary, revision,
  timestamps.
- **Node**: A visual object on the board. Returned in the `nodes`
  array when active (not soft-deleted). Key attributes: id, boardId,
  type, parentId, geometry (x, y, width, height, rotation, zIndex),
  content, style, metadata, locked, hidden, timestamps.
- **Edge**: A connector between two nodes on the same board. Returned
  in the `edges` array when active (not soft-deleted). Key attributes:
  id, boardId, sourceNodeId, targetNodeId, label, style, metadata,
  timestamps.
- **Chat Thread**: A persistent conversation container for the board.
  Returned as thread metadata (id and boardId) in the state response.
  One board has exactly one chat thread.
- **Revision Marker**: The `lastOperationRevision` integer reflecting
  the board's current revision — the sync primitive the frontend uses
  as its baseline after hydration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can load the complete state of a board with up to
  500 nodes and 1,000 edges in under 2 seconds end-to-end.
- **SC-002**: A newly created empty board returns a valid, parseable
  state envelope on the first request after creation.
- **SC-003**: Soft-deleted nodes and edges never appear in the state
  response — verified across all test scenarios involving deletion.
- **SC-004**: Deleted boards consistently return 404 BOARD_NOT_FOUND
  from the state endpoint — no partial or stale data is returned.
- **SC-005**: The state response envelope shape is identical across
  empty boards, boards with one node, and boards with many mixed-type
  nodes and edges.
- **SC-006**: The frontend can reliably parse and normalize the state
  response into its local store without special-casing empty or
  populated boards.
- **SC-007**: The `lastOperationRevision` in the state response always
  matches the board's current `revision` field, providing a consistent
  sync baseline.
- **SC-008**: Archived boards return the full state envelope
  successfully, allowing the user to view board content in read-only
  mode.

## Scope Exclusions

The following are explicitly out of scope for this feature and belong
to later roadmap slices:

- Node mutation endpoints (create, update, delete) — belongs to S4
- Edge mutation endpoints (create, update, delete) — belongs to S5
- Asset upload and image node creation — belongs to S7
- Chat message send flow and message retrieval — belongs to S8
- Agent suggest and apply flows — belongs to S9/S10
- Operations polling endpoint — belongs to S11
- Batch node mutations — belongs to S6
- Viewport-based partial loading optimization — future enhancement
- Revision or operations foundation (revision increment policy, operation logging) — belongs to S3

## Assumptions

- Board creation (S1) already exists and guarantees a chat thread per
  board. This feature depends on that guarantee.
- Nodes and edges may not yet exist in the database when this feature
  is first delivered. The endpoint must handle the empty case
  gracefully as the primary scenario.
- When nodes and edges do exist (via later slices or test seeding),
  they follow the schema defined in the data model documentation.
- Full-state hydration (returning all nodes and edges) is acceptable
  for MVP. Viewport-based partial loading is a future optimization.
- The ordering of nodes (by z_index, then createdAt) and edges (by
  createdAt) follows the query patterns defined in the data model
  documentation.
- Chat messages are not included in the state hydration response; only
  thread metadata is returned. Message retrieval is part of S8.
