# Feature Specification: Agent Apply

**Feature Branch**: `011-agent-apply`  
**Created**: 2026-03-17  
**Status**: Draft  
**Input**: User description: "@speckit-prompts.md (690-740) Create the next feature spec for Context Board MVP: 011-agent-apply."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confidently apply a valid agent plan (Priority: P1)

A board owner or collaborator has requested an agent suggestion for changes to a board (for example, restructuring nodes and edges, renaming items, or adjusting layout). They review the agent’s suggested action plan, decide it looks correct, and choose to apply it. The system validates the plan, applies all included creates, updates, deletes, and layout changes to the board in one atomic operation, and returns a clear confirmation along with the updated board state.

**Why this priority**: This flow is the only durable write path for agent-generated changes. It must be reliable and easy to trust so that users feel safe letting the agent update real boards.

**Independent Test**: Trigger an agent suggestion that produces a valid action plan, then apply it and verify that all specified changes are committed, the board revision increments exactly once, operations are recorded, and the returned state matches what the user sees.

**Acceptance Scenarios**:

1. **Given** a board with an available agent action plan preview, **When** the user clicks Apply, **Then** the system MUST validate the plan, apply all specified changes in a single transaction, increment the board revision exactly once, and return an updated board state reflecting all changes.
2. **Given** a successful apply, **When** the user re-opens the board or refreshes the page, **Then** the board MUST still reflect the applied changes and the same incremented revision number.

---

### User Story 2 - Safe failure for invalid or conflicting plans (Priority: P2)

A user attempts to apply an agent action plan that is no longer valid—for example, because the underlying board has changed since the preview, the plan references locked targets, or validation rules are violated. The system rejects the apply, explains why the plan is invalid in user-friendly terms, and guarantees that no partial state is committed.

**Why this priority**: Users must never end up with partially applied or corrupted boards. Clear, safe failure modes are critical for trust in agent-driven changes.

**Independent Test**: Create a scenario where the action plan becomes invalid (such as locking a node, deleting a referenced entity, or violating validation rules), then attempt apply and verify that the system returns an appropriate error, records no durable changes, and leaves the board revision unchanged.

**Acceptance Scenarios**:

1. **Given** an action plan that references a locked node or other locked target, **When** the user tries to apply it, **Then** the system MUST respond with a 409 `LOCKED_NODE` style error, MUST NOT commit any part of the plan, and MUST leave the board revision unchanged.
2. **Given** an action plan that fails validation (for example, broken references, schema violations, or disallowed operations), **When** the user tries to apply it, **Then** the system MUST respond with a 422 `ACTION_PLAN_INVALID` style error that includes structured reasons, and MUST NOT commit any part of the plan.

---

### User Story 3 - Prevent duplicate apply of the same plan (Priority: P3)

A user (or their browser) accidentally triggers the apply action multiple times for the same action plan—for example, by double-clicking the Apply button, clicking while the network is slow, or retrying after a transient error. The system detects duplicate apply attempts for the same plan and ensures that changes are only committed once.

**Why this priority**: Without duplicate protection, users could end up with repeated changes, duplicated nodes, or unexpected revisions, which erodes trust in agent-driven edits.

**Independent Test**: Simulate multiple rapid apply requests for the same action plan and verify that only one successful apply is committed, no duplicated entities are created, and the board revision increases at most once for that plan.

**Acceptance Scenarios**:

1. **Given** a valid action plan that has not yet been applied, **When** two identical apply requests are sent concurrently, **Then** the system MUST commit at most one apply, MUST ensure the board revision increments at most once, and MUST treat the second request as a safe duplicate (for example, returning the committed state without re-applying).
2. **Given** an apply request that already succeeded, **When** the user retries apply for the same plan identifier, **Then** the system MUST NOT re-apply the changes and SHOULD return a response that reflects the already committed state.

---

### Edge Cases

- What happens when an action plan references temporary client IDs that cannot be resolved to newly created durable entities (for example, missing or mismatched temp IDs)?
- How does the system handle concurrent non-agent edits to the same board between preview and apply, especially when they conflict with the plan’s operations?
- How does the system respond when apply succeeds on the server but the client loses connectivity before receiving the response (for example, ensuring the client can reconcile to the committed revision on reconnect)?
- How are applies handled when multiple users attempt to apply different plans to overlapping nodes or edges at nearly the same time, and one or more targets are locked?
- What happens when the action plan exceeds reasonable size or complexity thresholds (for example, very large batches of operations)? The system MUST enforce explicit upper bounds on per-apply operation count and payload size (for example, a maximum number of operations and request body size), and MUST reject plans that exceed those limits with a clear, user-visible error explaining that the change set is too large and should be split into smaller applies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose an explicit apply interaction that takes an agent-generated action plan for a specific board and attempts to commit all proposed creates, updates, deletes, and layout changes as a single atomic operation.
- **FR-002**: The system MUST treat apply as the only durable write path for agent-generated changes; previewed content MUST NOT be treated as committed board state until a successful apply completes.
- **FR-003**: On successful apply, the system MUST increment the board’s revision number exactly once and only once for that apply, and MUST ensure that all committed changes correspond to that new revision.
- **FR-004**: The system MUST execute all plan operations (creates, updates, deletes, and layout changes) in a transaction such that either all changes are committed together or none are committed, with no partial state visible to users.
- **FR-005**: For each committed apply, the system MUST write durable operation records that capture the applied changes, including linkage to the originating board, revision, and an agent-attributed actor so that the change history clearly indicates agent-driven operations.
- **FR-006**: If any operation in the action plan targets a locked node or other locked resource, the system MUST reject the entire apply, return a 409-style `LOCKED_NODE` error, and MUST NOT commit any of the plan’s operations.
- **FR-007**: If the action plan fails validation (for example, invalid structure, broken references, disallowed operations, or mismatched board state), the system MUST reject the apply with a 422-style `ACTION_PLAN_INVALID` error that includes structured, machine-readable reasons that the UI can surface in user-friendly form.
- **FR-008**: The system MUST support temporary ID resolution for newly created entities in the action plan, mapping client-provided temporary IDs to durable identifiers, and MUST return a mapping in the apply response so the client can reconcile its local state.
- **FR-009**: The apply API and internal logic MUST be designed to prevent duplicate application of the same plan by deriving an idempotency key as a deterministic hash of the normalized action plan plus the current board revision, and treating identical keys within a bounded retention window as the same apply attempt so that retries or duplicate requests cannot cause the same operations to be committed multiple times.
- **FR-010**: The apply response MUST provide enough data for the client to reconcile confirmed state, including the new board revision, an authoritative representation of the committed changes (or updated board view), and any temp-to-durable ID mappings required for local state updates.
- **FR-011**: The UI MUST present apply as a deliberate user action distinct from suggestion generation, MUST show clear loading, success, and failure states for apply, and MUST avoid showing preview content as permanent until the server-confirmed response is received.
- **FR-012**: The system MUST ensure that error responses for failed applies (including 409 and 422 cases) provide concise, human-readable summaries with high-level reasons and stable error codes suitable for display in the UI, while full technical details (such as raw validation output, internal identifiers, and stack traces) are recorded only in server-side logs and not exposed to end users.

### Key Entities *(include if feature involves data)*

- **Agent Action Plan**: Represents a proposed set of operations generated by an agent for a given board, including creates, updates, deletes, and layout changes, along with any temporary IDs that will need resolution during apply.
- **Apply Invocation**: Represents a single attempt to commit an agent action plan to a board, including metadata such as the initiating user, timestamp, associated board, optional idempotency key, status (succeeded, failed, rejected), and any error reasons.
- **Board Revision**: Represents the durable version of a board’s state; each successful apply increments the revision exactly once and is associated with a coherent set of operations that describe how the board changed.
- **Operation Record**: Represents an individual durable operation written when an apply succeeds, capturing what changed (for example, which node or edge, what fields), why (agent-attributed context), and how it relates to the board and revision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For valid plans under typical load, at least 95% of successful applies complete from user click to confirmed updated board view in under 2 seconds.
- **SC-002**: In automated test environments that simulate validation failures, locked targets, and other error conditions, 100% of failed applies result in zero committed changes and no board revision increment.
- **SC-003**: Across monitored usage over an initial rollout period, duplicate-apply incidents that result in repeated or unexpected changes occur in fewer than 0.1% of apply attempts, with no known cases of the same plan being durably committed more than once.
- **SC-004**: In usability testing, at least 90% of participants report that they understand when agent changes are “just a preview” versus durably applied, and are able to successfully complete at least one apply flow without assistance.
- **SC-005**: For applies that fail due to `ACTION_PLAN_INVALID` or `LOCKED_NODE` style conditions, at least 90% of error events include structured reasons that can be surfaced to users, and follow-up user testing shows that at least 80% of users can describe what they need to do next (for example, unlock a node, refresh the plan, or adjust changes) after seeing the error.

## Clarifications

### Session 2026-03-17

- Q: How should duplicate-apply idempotency be defined in terms of key source, lifetime, and scope? → A: Derive a hash of the normalized action plan plus the current board revision and treat identical hashes within a bounded retention window as the same apply attempt.
- Q: What practical limits should apply impose on action plan size and complexity? → A: Enforce explicit caps on per-apply operation count and payload size and reject oversized plans with a clear error instructing users to split the change into smaller applies.
- Q: What level of detail should user-visible error messages expose compared to server logs? → A: Show concise, friendly summaries with high-level reasons and stable error codes in the UI while keeping full technical details only in server-side logs.

