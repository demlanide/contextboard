# Feature Specification: Board Foundation

**Feature Branch**: `001-board-foundation`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "Create the first feature spec for Context Board MVP: 001-board-foundation. Maps to roadmap slice S1."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create a New Board (Priority: P1)

A user opens the application and creates a new workspace where they can
start thinking visually. The system provisions a board with a default
title (or a user-supplied title), initializes its revision counter, and
automatically creates the board's chat thread. The user lands on a
ready-to-use board.

**Why this priority**: Without the ability to create a board, no other
feature in the product has meaning. This is the absolute foundation.

**Independent Test**: Can be fully tested by sending a create request
and verifying the returned board metadata, initial revision, and
auto-created chat thread. Delivers the first usable workspace.

**Acceptance Scenarios**:

1. **Given** no boards exist, **When** the user creates a board with
   title "Travel brainstorm", **Then** the system returns a 201
   response containing a board with status `active`, revision `0`, and
   an associated chat thread with its own id and boardId.

2. **Given** no boards exist, **When** the user creates a board with
   only a title and no optional fields, **Then** the system returns a
   board with default viewport state, default settings, and an empty
   summary.

3. **Given** a board was just created, **When** the user sends the same
   create request with the same idempotency key, **Then** the system
   returns the same 201 response as the original request without
   creating a duplicate board.

4. **Given** no boards exist, **When** the user sends a create request
   with an empty title, **Then** the system returns a validation error.

5. **Given** no boards exist, **When** the user sends a create request
   with a title exceeding 200 characters, **Then** the system returns
   a validation error.

---

### User Story 2 — Browse Existing Boards (Priority: P2)

A user opens the application and sees a list of their boards so they
can select one to work on. The list shows non-deleted boards, with
the most recently updated boards appearing first.

**Why this priority**: After creating boards, the user needs to find
and open them. Listing is the primary navigation mechanism.

**Independent Test**: Can be fully tested by creating several boards
and verifying the list response contains only non-deleted boards in
the expected order.

**Acceptance Scenarios**:

1. **Given** three boards exist in `active` status, **When** the user
   requests the board list, **Then** all three boards are returned
   sorted by most recently updated first.

2. **Given** one active board and one deleted board exist, **When** the
   user requests the board list, **Then** only the active board is
   returned.

3. **Given** one active board and one archived board exist, **When**
   the user requests the board list, **Then** both boards are returned.

4. **Given** no boards exist, **When** the user requests the board
   list, **Then** an empty list is returned.

---

### User Story 3 — View Board Metadata (Priority: P2)

A user navigates to a specific board and the system loads its metadata
so the frontend can display the board header, title, and settings.

**Why this priority**: Same priority as listing because together they
form the complete board navigation flow. Viewing metadata is required
before any board interaction begins.

**Independent Test**: Can be fully tested by creating a board and
fetching its metadata by id, verifying all fields are present and
match the created state.

**Acceptance Scenarios**:

1. **Given** an active board exists, **When** the user requests board
   metadata by id, **Then** the system returns the full board object
   including title, status, viewport state, settings, summary, revision,
   and timestamps.

2. **Given** a board has been soft-deleted, **When** the user requests
   its metadata by id, **Then** the system returns a 404 BOARD_NOT_FOUND
   error.

3. **Given** an archived board exists, **When** the user requests its
   metadata by id, **Then** the system returns the full board object
   with status `archived`.

4. **Given** no board exists for the given id, **When** the user
   requests board metadata, **Then** the system returns a 404
   BOARD_NOT_FOUND error.

---

### User Story 4 — Update Board Title and Settings (Priority: P3)

A user renames their board, adjusts viewport state, or changes board
settings. The system applies a partial update using merge-patch
semantics, increments the board revision, and logs the operation.

**Why this priority**: Updating metadata is needed for a meaningful
workspace experience but is not required to demonstrate board creation
or listing in isolation.

**Independent Test**: Can be fully tested by creating a board, sending
a patch request, and verifying the updated fields, unchanged fields,
incremented revision, and operation log entry.

**Acceptance Scenarios**:

1. **Given** an active board with title "Old title", **When** the user
   sends a patch with `{"title": "New title"}`, **Then** the board
   title changes to "New title", description remains unchanged, and
   revision increments by one.

2. **Given** an active board, **When** the user sends a patch with
   `{"viewportState": {"x": 120, "y": 80, "zoom": 1.5}}`, **Then**
   the viewport state is replaced with the new values.

3. **Given** an active board, **When** the user sends a patch with
   `{"settings": {"gridEnabled": false}}`, **Then** the settings
   object merges the new key while preserving other existing keys.

4. **Given** an active board, **When** the user sends a patch with
   content type `application/json` instead of
   `application/merge-patch+json`, **Then** the system returns a 415
   Unsupported Media Type error.

5. **Given** an archived board, **When** the user sends any patch
   request, **Then** the system returns a 409 error indicating the
   board is not editable.

6. **Given** a deleted board, **When** the user sends any patch
   request, **Then** the system returns a 404 BOARD_NOT_FOUND error.

7. **Given** an active board, **When** the user sends a patch with
   a title exceeding 200 characters, **Then** the system returns a
   validation error.

---

### User Story 5 — Remove a Board (Priority: P3)

A user deletes a board they no longer need. The board is soft-deleted:
it disappears from the normal board list and becomes inaccessible
through normal read endpoints, but is not physically destroyed.

**Why this priority**: Same as update — needed for a complete board
management experience but not required for the most basic create-and-use
flow.

**Independent Test**: Can be fully tested by creating a board,
deleting it, and verifying it disappears from listing and returns
not-found on metadata and state reads.

**Acceptance Scenarios**:

1. **Given** an active board exists, **When** the user deletes it,
   **Then** the system returns a success response with the board id.

2. **Given** a board has been deleted, **When** the user requests the
   board list, **Then** the deleted board does not appear.

3. **Given** a board has been deleted, **When** the user requests its
   metadata by id, **Then** the system returns 404 BOARD_NOT_FOUND.

4. **Given** a board has been deleted, **When** the user requests its
   full state, **Then** the system returns 404 BOARD_NOT_FOUND.

5. **Given** a board has been deleted, **When** the user attempts to
   delete it again, **Then** the system returns 404 BOARD_NOT_FOUND
   (delete is not idempotent against already-deleted boards through the
   normal API).

6. **Given** an active board at revision 3, **When** the user deletes
   it, **Then** the system writes an operation log entry with
   board_revision `3` and the board's revision remains `3` (no
   increment).

---

### User Story 6 — Archived Board Enforces Read-Only (Priority: P4)

A board can transition to an `archived` state where it remains visible
and readable but rejects all durable mutations. This protects finished
or reference boards from accidental changes.

**Why this priority**: Archival is important for data safety but is not
required for the core create/list/edit/delete lifecycle to function.

**Independent Test**: Can be fully tested by creating a board,
transitioning it to archived status, and verifying that read operations
succeed while mutation operations are rejected.

**Acceptance Scenarios**:

1. **Given** an archived board, **When** the user requests the board
   list, **Then** the archived board appears in the list with status
   `archived`.

2. **Given** an archived board, **When** the user requests its
   metadata, **Then** the system returns the board with status
   `archived`.

3. **Given** an archived board, **When** the user sends a metadata
   patch request, **Then** the system returns a 409 error indicating
   the board is not editable.

4. **Given** an active board, **When** the user sends a patch with
   `{"status": "archived"}`, **Then** the board status changes to
   `archived` and subsequent mutation requests are rejected.

5. **Given** an archived board, **When** the user sends a patch with
   `{"status": "active"}`, **Then** the system returns a 409 error
   because `archived → active` is not an allowed transition in MVP.

6. **Given** an active board at revision 5, **When** the user sends a
   patch with `{"status": "archived"}`, **Then** the board revision
   increments to 6 and an operation log entry is written with
   board_revision `6`.

7. **Given** an archived board, **When** any future mutation endpoint
   (node create, edge create, agent apply) targets it, **Then** the
   system rejects the request because the board is not editable.

---

### Edge Cases

- What happens when a board create request includes unknown or extra
  fields in the body? The system should ignore unknown fields or reject
  them consistently per project policy.
- What happens when two create requests arrive concurrently with
  different idempotency keys? Both should succeed and create separate
  boards.
- What happens when a patch request sends `null` for the description
  field? If description is nullable, the value should be cleared.
- What happens when a patch request sends an empty object `{}`? The
  board should remain unchanged and revision should not increment.
- What happens when a board's status is changed from `active` to
  `deleted` and then a create request reuses the same idempotency key
  as the original create? The original response should be returned
  without resurrecting the deleted board.
- How does the system handle a malformed UUID in the board id path
  parameter? The system should return a 400 error before any domain
  logic executes.

## Clarifications

### Session 2026-03-16

- Q: How is board archival initiated — via PATCH status field or a dedicated endpoint? → A: Archive via `PATCH /boards/{boardId}` by setting `{"status": "archived"}` with domain-validated status transitions.
- Q: Should board soft-delete write an operation log entry even though it does not increment revision? → A: Yes. Soft-delete writes an operation log entry (using the board's current pre-delete revision) but does not increment revision. This satisfies the constitution's operations-first rule.
- Q: Should board archival (active → archived) increment revision or skip it like delete? → A: Archival increments revision and writes an operation log entry. Unlike delete, the archived board remains a visible sync target, so polling clients must see the transition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creation of a new board with a
  required title (1–200 characters) and an optional description (max
  10,000 characters).
- **FR-002**: System MUST automatically create exactly one chat thread
  for each newly created board within the same transactional operation.
- **FR-003**: System MUST initialize new boards with status `active`,
  revision `0`, default viewport state, default settings, and an empty
  summary.
- **FR-004**: System MUST return a 201 status code for successful board
  creation.
- **FR-005**: System MUST support idempotent board creation via an
  `Idempotency-Key` header; replaying the same key with the same
  payload returns the original response.
- **FR-006**: System MUST reject idempotent retries where the same key
  is reused with a different payload, returning a 409 IDEMPOTENCY_CONFLICT
  error.
- **FR-007**: System MUST list non-deleted boards sorted by most
  recently updated first.
- **FR-008**: System MUST exclude boards with status `deleted` from the
  normal list response.
- **FR-009**: System MUST return board metadata for any board that is
  not in `deleted` status when requested by id.
- **FR-010**: System MUST return 404 BOARD_NOT_FOUND for metadata and
  state reads targeting a deleted or nonexistent board.
- **FR-011**: System MUST support partial board metadata updates using
  JSON Merge Patch semantics with content type
  `application/merge-patch+json`.
- **FR-012**: System MUST reject patch requests that use
  `application/json` instead of `application/merge-patch+json` with
  a 415 Unsupported Media Type error.
- **FR-013**: System MUST validate all patch fields: title length
  (1–200 chars), description length (max 10,000 chars), viewport state
  is a valid object, settings is a valid object.
- **FR-014**: System MUST reject metadata mutation on archived boards
  with a conflict-class error (409).
- **FR-014a**: Board status MUST be patchable via
  `PATCH /boards/{boardId}` with `{"status": "archived"}`. The domain
  layer MUST enforce allowed transitions: `active → archived` and
  `active → deleted`. All other transitions MUST be rejected with a
  409 conflict-class error.
- **FR-014b**: Archiving a board (`active → archived`) MUST increment
  the board revision exactly once and write an operation log entry,
  because the archived board remains a visible sync target.
- **FR-015**: System MUST soft-delete boards by transitioning status to
  `deleted` rather than physically removing them.
- **FR-016**: Successful board metadata updates MUST increment the
  board revision exactly once and write an operation log entry.
- **FR-017**: Board soft-delete MUST NOT increment revision (the board
  is no longer an active sync target). However, the delete MUST still
  write an operation log entry with the board's current (pre-delete)
  revision to satisfy the operations-first mutation model.
- **FR-018**: System MUST support three board statuses in MVP: `active`,
  `archived`, and `deleted`.
- **FR-019**: Archived boards MUST be readable but MUST reject all
  durable mutation operations.
- **FR-020**: System MUST use a standard error response envelope with
  `code`, `message`, and optional `details` for all error responses.
- **FR-021**: System MUST validate path parameters (board id format)
  at the request boundary before domain logic.

### Assumptions

- The MVP has no authentication; all requests are treated as coming
  from a single implicit user.
- Chat thread creation on board create is a backend concern; the
  frontend does not need to issue a separate thread creation request.
- Board archival is initiated via `PATCH /boards/{boardId}` by setting
  `{"status": "archived"}`. Allowed status transitions are validated in
  the domain layer: `active → archived` and `active → deleted` are
  permitted; all other transitions (e.g., `archived → active`,
  `deleted → active`) are rejected in MVP.
- An empty patch body `{}` is a valid no-op that does not increment
  revision.
- The `GET /boards/:boardId/state` endpoint returning 404 for deleted
  boards is part of this slice's scope because it relates to board
  lifecycle visibility, even though the full state hydration payload
  is detailed in a later slice (S2).

### Key Entities

- **Board**: The top-level workspace entity. Key attributes: id,
  title, description, status (active/archived/deleted), viewport state,
  settings, summary, revision, created/updated timestamps.
- **Chat Thread**: A persistent conversation container automatically
  created for each board. Key attributes: id, board id (unique
  one-to-one), metadata, created/updated timestamps. One board has
  exactly one chat thread in MVP.
- **Board Operation**: An append-only log entry recording each durable
  board state change. Key attributes: id, board id, board revision,
  actor type, operation type, target type, payload, timestamp. Used for
  audit, sync, and future undo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a new board and receive a confirmed,
  usable workspace in under 2 seconds end-to-end.
- **SC-002**: Listing boards returns results within 400 milliseconds
  for up to 100 boards.
- **SC-003**: Board metadata reads complete within 400 milliseconds.
- **SC-004**: Board metadata updates complete within 800 milliseconds.
- **SC-005**: Every successful board metadata update produces exactly
  one revision increment and one or more operation log entries.
- **SC-006**: Deleted boards are never returned in normal board listing
  or metadata reads.
- **SC-007**: Archived boards reject all durable mutation attempts
  consistently across every mutation endpoint.
- **SC-008**: Idempotent board creation returns identical responses for
  duplicate requests with the same key and payload.
- **SC-009**: Board creation always produces exactly one chat thread
  per board; never zero, never more than one.
- **SC-010**: All board lifecycle test cases from the test matrix
  (T001–T006) pass.

## Scope Exclusions

The following are explicitly out of scope for this feature and belong
to later roadmap slices:

- Full board state hydration payload (nodes, edges, asset metadata) —
  belongs to S2
- Node CRUD — belongs to S4
- Edge CRUD — belongs to S5
- Asset upload and image nodes — belongs to S7
- Chat message send flow — belongs to S8
- Agent suggest and apply — belongs to S9/S10
- Operations polling endpoint — belongs to S11
- Batch node mutations — belongs to S6
