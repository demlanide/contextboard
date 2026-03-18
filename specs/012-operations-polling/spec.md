# Feature Specification: Operations polling for board revisions

**Feature Branch**: `012-operations-polling`  
**Created**: 2026-03-17  
**Status**: Draft  
**Input**: User description: "Create the next feature spec for Context Board MVP: 012-operations-polling."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Incremental board updates via polling (Priority: P1)

Board users who keep a board open for extended periods want the visible board state to stay in sync with confirmed backend state by periodically polling for new operations based on a revision cursor.

**Why this priority**: This enables basic continuity of work over time without requiring realtime infrastructure, and provides the foundation for reliable multi-step editing sessions.

**Independent Test**: With a board that already has some committed operations, open the board at revision \(R\), perform additional actions that commit new operations, and verify that polling using `afterRevision = R` eventually yields all newer operations in deterministic order with no duplicates or gaps, updating the client state to match backend state.

**Acceptance Scenarios**:

1. **Given** a board with confirmed revision \(R\) and a client whose last known confirmed revision is also \(R\), **When** the client calls `GET /boards/{boardId}/operations?afterRevision=R&limit=L` on a board where new operations up to revision \(R+N\) exist, **Then** the response includes all operations with revisions strictly greater than \(R\) and up to a deterministic cut-off, ordered by revision and suitable for applying in sequence to reach a newer confirmed state.
2. **Given** a client that has applied all operations returned from a polling call for `afterRevision = R`, **When** the client repeats the same call with `afterRevision` equal to the latest applied revision, **Then** no operations already applied are returned again.

---

### User Story 2 - Paginated polling for long-running boards (Priority: P2)

Users working on boards with a long history of operations need the polling API to support limits and pagination so that large ranges of operations can be fetched incrementally without overloading the client or server.

**Why this priority**: Without pagination, boards with a large backlog of operations would cause slow responses and degraded experience when resuming work after inactivity.

**Independent Test**: Seed a board with a large number of operations after a given revision, then issue repeated polling calls with a small `limit` value, verifying that the client can paginate through all operations, that each page respects `afterRevision` semantics, and that applying all pages in order results in the same confirmed state as applying the full operation history.

**Acceptance Scenarios**:

1. **Given** a board where there are more than \(L\) operations after revision \(R\), **When** the client calls `GET /boards/{boardId}/operations?afterRevision=R&limit=L`, **Then** the response contains exactly \(L\) operations (unless fewer exist) and a highest revision \(R'\) that can be used as the next `afterRevision` to continue polling.
2. **Given** a sequence of paginated polling calls that each use `afterRevision` equal to the last operation revision returned in the prior call, **When** all operations from each page are applied in order, **Then** the final client state matches the backend’s confirmed state for the board.

---

### User Story 3 - Detecting stale or divergent client state (Priority: P3)

Users returning to a board after an extended offline or background period need the system to detect when their local confirmed state is stale or incompatible with the backend’s durable history so that a full rehydrate can be triggered.

**Why this priority**: This prevents subtle data corruption or missing updates when a client’s last known revision is no longer a safe starting point for incremental polling (for example, after history-compacting operations or data repair).

**Independent Test**: Create a situation where the client’s stored revision is earlier than the minimum revision the backend can safely serve for incremental polling, then verify that an operations polling request is rejected with a clear indication that the client should rehydrate from the board-state endpoint instead of attempting to continue incrementally.

**Acceptance Scenarios**:

1. **Given** a client whose `afterRevision` is older than the backend’s supported minimum revision for incremental polling, **When** the client calls the operations polling endpoint, **Then** the response indicates that incremental polling is not possible and instructs the client to perform a full board-state rehydrate.
2. **Given** a client that has rehydrated the full board state to a new confirmed revision \(R_{\text{new}}\), **When** the client resumes operations polling using `afterRevision = R_{\text{new}}`, **Then** incremental polling succeeds and does not return operations that conflict with the rehydrated state.

---

### Edge Cases

- What happens when a client passes an `afterRevision` that is greater than or equal to the backend’s current confirmed revision for the board?
- How does the system handle polling with an invalid or non-existent `boardId`?
- How does the system respond if `limit` is omitted, set to zero, or exceeds the maximum allowed page size?
- What happens if operations exist for the board but none are strictly after the requested `afterRevision`?
- How does the system behave when the board has been deleted or archived between polling requests?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose an HTTP `GET /boards/{boardId}/operations` endpoint that accepts `afterRevision` and `limit` query parameters for retrieving operations.
- **FR-002**: The system MUST ensure that operations returned from the polling endpoint reflect only committed durable state for the specified board.
- **FR-003**: The system MUST return only operations whose associated revisions are strictly greater than the supplied `afterRevision` value.
- **FR-004**: The system MUST return operations in a stable, deterministic order that allows clients to apply them sequentially to advance the board’s confirmed state.
- **FR-005**: The system MUST enforce a maximum page size for `limit` and MUST cap any larger requested value to this maximum while documenting the behavior.
- **FR-006**: The system MUST support pagination by allowing clients to chain polling calls using the latest received operation revision as the next `afterRevision` until no further operations are available.
- **FR-007**: The system MUST respond with a clear indication (for example, a specific status and error code) when the provided `afterRevision` is too old or otherwise incompatible with incremental polling, so that clients can trigger a full board-state rehydrate.
- **FR-008**: The system MUST treat the backend as the sole source of truth for board operations and MUST not infer or synthesize operations on the client.
- **FR-009**: The system MUST ensure that incremental polling does not introduce a second, conflicting state system on the client; applying the sequence of returned operations MUST always converge to the same confirmed state as a fresh board-state hydration for the same final revision.
- **FR-010**: The system MUST validate that `boardId` refers to an accessible board and MUST return an appropriate error if the board does not exist or is not accessible to the caller.
- **FR-011**: The system MUST define and document behavior when `afterRevision` is omitted, including which starting revision is assumed and how this interacts with the board-state hydration endpoint.
- **FR-012**: The system MUST define and document behavior when `afterRevision` is greater than or equal to the backend’s current confirmed revision, including returning an empty operation set without error when appropriate.
- **FR-013**: The system MUST log failures and unexpected conditions related to operations polling in a way that supports debugging and monitoring without exposing sensitive data to end users.

### Key Entities *(include if feature involves data)*

- **Board**: Represents a collaborative canvas whose durable state is defined by a sequence of committed operations and associated revisions.
- **Operation**: Represents a single, immutable change to a board’s state, associated with a specific revision number and containing enough metadata for deterministic application in order.
- **Revision Cursor**: Represents a client’s last known confirmed revision for a given board, used as the `afterRevision` anchor for incremental polling.
- **Client Sync Session**: Represents a conceptual view of a client instance’s attempt to stay in sync with backend state using a combination of one-time board-state hydration and subsequent operations polling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For boards with up to a typical number of recent operations after a given revision, 95% of polling requests complete quickly enough that users perceive board updates as responsive during active editing sessions.
- **SC-002**: For boards with large histories where many operations exist after a given revision, clients can advance from a stale revision to the latest confirmed revision using paginated polling without failing requests or data loss in at least 99% of test runs.
- **SC-003**: In automated tests comparing a board hydrated from the board-state endpoint to the same board reached via incremental polling from an earlier revision, 100% of comparisons show identical confirmed state when both are at the same final revision.
- **SC-004**: In test scenarios where a client’s stored revision is no longer valid for incremental polling, 100% of polling requests result in clear responses that cause clients to perform a full rehydrate rather than attempting to continue incrementally.

