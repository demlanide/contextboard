# Feature Specification: Chat Persistence

**Feature Branch**: `009-chat-persistence`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Chat persistence - board-scoped durable chat thread with message history, selection context, and chat panel UI"

## Clarifications

### Session 2026-03-16

- Q: When the agent fails to respond (timeout/error), should a durable error record be persisted in the chat thread alongside the user message? → A: No. Only the user message is persisted. The error is shown ephemerally in the UI and not stored as a chat record.
- Q: Should the chat panel be open or closed by default when a user enters a board? → A: Open by default. The user can close it to reclaim canvas space.
- Q: Should messages sent with selection context display a visible indicator in the chat panel? → A: Yes. Show a subtle indicator (e.g., "3 nodes, 1 edge selected") on messages that were sent with selection context.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load Chat History on Board Entry (Priority: P1)

A user opens an existing board and expects to see previous chat messages from prior sessions. The chat panel displays the full conversation history for that board, ordered chronologically, so the user can resume where they left off without losing context.

**Why this priority**: Without durable chat history, the board loses conversational context between sessions. This is the foundational capability that makes chat persistence meaningful. All other chat features depend on messages being retrievable.

**Independent Test**: Can be fully tested by creating a board, sending messages through the API, closing the board, reopening it, and verifying that all previous messages appear in chronological order. Delivers the core value of persistent board-scoped conversation.

**Acceptance Scenarios**:

1. **Given** a board with existing chat messages, **When** the user opens the board, **Then** the chat panel loads and displays all previous messages in chronological order with correct sender attribution (user vs agent).
2. **Given** a board with no chat messages, **When** the user opens the board, **Then** the chat panel displays an empty state indicating no messages yet, with the message composer ready for input.
3. **Given** a board that has been archived, **When** the user opens the board, **Then** the chat panel displays historical messages in read-only mode and the message composer is disabled or hidden.
4. **Given** a board with many messages, **When** the user loads the chat panel, **Then** recent messages are displayed promptly without the user waiting for the full conversation to render.

---

### User Story 2 - Send a Chat Message and Receive a Response (Priority: P1)

A user types a message in the chat composer, sends it, and receives a response from the AI agent. Both the user message and the agent reply are persisted durably and appear in the chat history. The board itself does not change as a result of plain chat messaging.

**Why this priority**: This is the primary interactive chat flow. Without the ability to send and receive messages, the chat feature has no utility. Persistence of both sides of the conversation is essential for continuity.

**Independent Test**: Can be tested by opening a board, typing a message, submitting it, verifying the user message appears immediately, the agent response appears after processing, and both messages are still visible after a page reload.

**Acceptance Scenarios**:

1. **Given** an active board with the chat panel open, **When** the user types a message and submits it, **Then** the user message appears in the chat thread immediately, a loading indicator shows while waiting for the agent, and the agent reply appears when ready.
2. **Given** an active board, **When** the user sends a message and the agent responds, **Then** the board state (nodes, edges, revision) remains unchanged because plain chat does not mutate the board.
3. **Given** an active board, **When** the user sends a message and then reloads the page, **Then** both the user message and the agent response are still visible in the chat history.
4. **Given** an archived board, **When** the user attempts to send a message, **Then** the system rejects the message and informs the user that the board is read-only.

---

### User Story 3 - Send a Message with Selection Context (Priority: P2)

A user selects one or more nodes on the board canvas and then sends a chat message. The system captures which nodes are selected and the current viewport at the time the message is sent. This context is stored alongside the user message so the agent can reference what the user was looking at.

**Why this priority**: Selection context enriches the conversation by grounding the user's question in specific board content. While chat functions without it, context makes agent responses significantly more relevant. This is important but not blocking for basic chat usage.

**Independent Test**: Can be tested by selecting nodes on the board, sending a chat message, and verifying that the stored message includes the correct selection context (selected node IDs, edge IDs, and viewport state). The agent response should reference or acknowledge the selected context.

**Acceptance Scenarios**:

1. **Given** an active board with nodes selected on the canvas, **When** the user sends a message, **Then** the message is stored with selection context including the IDs of selected nodes, selected edges, and the current viewport position.
2. **Given** an active board with no selection, **When** the user sends a message, **Then** the message is stored successfully without selection context (or with empty context), and the agent responds based on general board knowledge.
3. **Given** a stored message with selection context, **When** the user reloads the board and views chat history, **Then** the message is displayed without error regardless of whether the originally selected nodes still exist.

---

### User Story 4 - Chat Panel Interaction and Usability (Priority: P2)

The user interacts with the chat panel as part of the board screen. The panel can be opened and closed without losing chat state. The message composer provides clear feedback during the send flow including loading, success, and failure states. The chat panel coexists with the board canvas without obscuring critical workspace content.

**Why this priority**: Usability and discoverability of the chat panel are important for the product experience. However, the durable backend behavior takes precedence in the MVP since the UI can be iteratively polished. This story ensures baseline usability without blocking core persistence.

**Independent Test**: Can be tested by toggling the chat panel open and closed, verifying messages persist across toggle, submitting messages and observing loading/success/failure states, and confirming the panel layout does not prevent canvas interaction.

**Acceptance Scenarios**:

1. **Given** a board screen, **When** the user enters the board, **Then** the chat panel is open by default alongside the canvas with message history loaded and the composer ready for input.
2. **Given** a chat panel with messages, **When** the user closes and reopens the panel, **Then** the message history is preserved and displayed again without a new network request if the board has not been reloaded.
3. **Given** the user submits a message, **When** the request is in progress, **Then** the composer is disabled or the send button shows a loading state, and duplicate submissions are prevented.
4. **Given** the user submits a message, **When** the request fails, **Then** the user sees an error indication, the failed message text is preserved for retry, and the board state is not affected.

---

### User Story 5 - Chat Respects Board Lifecycle Rules (Priority: P3)

The chat system respects the board's lifecycle state. Active boards allow full chat interaction. Archived boards allow reading chat history but reject new messages. Deleted boards do not expose chat at all. These rules are enforced by the backend regardless of frontend behavior.

**Why this priority**: Lifecycle enforcement is a cross-cutting concern that must hold but is lower priority for initial delivery because most MVP usage involves active boards. Archived and deleted board scenarios are edge cases in early usage.

**Independent Test**: Can be tested by creating boards in each lifecycle state (active, archived, deleted) and verifying that chat read and write operations behave according to the lifecycle rules.

**Acceptance Scenarios**:

1. **Given** an active board, **When** the user sends a chat message, **Then** the message is accepted and persisted.
2. **Given** an archived board, **When** the user attempts to send a chat message, **Then** the request is rejected and the user is informed the board is read-only.
3. **Given** an archived board, **When** the user opens the chat panel, **Then** chat history is displayed normally.
4. **Given** a deleted board, **When** the user attempts to load chat, **Then** the system returns a not-found response.

---

### Edge Cases

- What happens when the user sends a message and the agent service is unavailable or times out? The user message is persisted durably. No agent message record is created. The error is shown ephemerally in the UI (not stored in the thread). On reload, the user sees their message without a corresponding agent response. The board must not be affected.
- What happens when the user sends multiple messages rapidly before the first response returns? The system should queue or serialize message sends and prevent duplicate submissions. Each message should be persisted independently.
- What happens when the user sends a message referencing selected nodes that were deleted between selection and send? The selection context should be stored as-is (a snapshot at send time), even if the referenced nodes no longer exist. The agent should handle stale references gracefully.
- What happens if the chat thread does not exist when the user opens the board? The thread is auto-created with the board, so this should not occur under normal operation. If it does, the system should return an appropriate error rather than silently failing.
- What happens when the agent response includes structured JSON (such as an action plan) in the message? The response is persisted as-is in the structured message field. Plain chat does not automatically trigger board mutations, but the structured content may be used by later features (agent suggest/apply).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist user chat messages durably so they survive page reloads and session restarts.
- **FR-002**: System MUST persist agent chat responses durably alongside the user messages they respond to.
- **FR-003**: System MUST store optional selection context (selected node IDs, selected edge IDs, viewport state) with each user message when the user provides it.
- **FR-004**: System MUST enforce one chat thread per board, auto-created when the board is created.
- **FR-005**: System MUST return the chat thread and its messages when the client requests board chat history.
- **FR-006**: System MUST return messages in chronological order (oldest first) when loading chat history.
- **FR-007**: System MUST NOT mutate board state (nodes, edges, revision) as a result of plain chat messaging.
- **FR-008**: System MUST reject new chat messages on archived boards while still allowing chat history reads.
- **FR-009**: System MUST return not-found for chat requests against deleted boards.
- **FR-010**: System MUST validate chat message text length (maximum 20,000 characters).
- **FR-011**: System MUST validate that selection context, when provided, is a well-formed object containing optional arrays of node IDs, edge IDs, and viewport state.
- **FR-012**: System MUST return both the persisted user message and the agent response in the send-message response so the client can render them without a separate fetch.
- **FR-020**: When agent response generation fails, the system MUST persist only the user message. No agent or system error message record is created in the thread. The failure is communicated to the client in the response envelope, and the frontend displays the error ephemerally.
- **FR-013**: System MUST display a visible chat panel or drawer as part of the board screen where the user can read history and compose messages. The panel MUST be open by default on board entry; the user may close it to reclaim canvas space.
- **FR-014**: System MUST show loading state in the message composer while a send request is in progress.
- **FR-015**: System MUST prevent duplicate message submissions while a send request is active.
- **FR-016**: System MUST display a clear error state when message send fails, preserving the user's draft text for retry.
- **FR-017**: System MUST render agent messages visually distinct from user messages in the chat panel.
- **FR-021**: System MUST display a subtle selection context indicator on chat messages that were sent with selection context (e.g., "3 nodes, 1 edge selected"), derived from the stored selection context data.
- **FR-018**: System MUST disable or hide the message composer when the board is archived.
- **FR-019**: Chat messages MUST be append-only; neither the user nor the system may edit or delete individual messages in MVP.

### Key Entities

- **Chat Thread**: A persistent container for board-scoped conversation. Exactly one thread exists per board, auto-created at board creation time. Carries thread-level metadata. Identified by a stable UUID.
- **Chat Message**: An individual message within a thread. Has a sender type (user, agent, or system), optional plain text content, optional structured JSON content (which may include action plans in agent messages), optional selection context captured at send time, and a creation timestamp. Messages are append-only and immutable after creation.
- **Selection Context**: A snapshot of the user's board selection state at the time a message is sent. Contains selected node IDs, selected edge IDs, and viewport state. Stored as a JSON object on the message. May reference entities that no longer exist at read time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can send a chat message and see the agent response within the board UI in under 5 seconds for typical prompts (excluding agent processing time).
- **SC-002**: Chat history for a board with up to 200 messages loads and renders in under 2 seconds on initial board entry.
- **SC-003**: 100% of user messages and agent responses sent through the chat flow are retrievable after page reload.
- **SC-004**: Users can complete the full send-message flow (type, send, see response) without leaving the board screen or losing canvas context.
- **SC-005**: The board revision does not change after any number of plain chat messages are sent and received.
- **SC-006**: Archived boards display chat history correctly and reject all new message attempts with a clear, user-understandable indication.
- **SC-007**: Selection context, when provided, is persisted with the message and retrievable in subsequent chat history loads.

## Assumptions

- The chat thread is auto-created as part of the board creation flow (established in prior slices S1/S2). This feature does not need to handle thread creation separately.
- The agent response generation mechanism (LLM integration) is either available or can be stubbed for MVP testing. The chat persistence feature is not responsible for the quality or correctness of agent responses, only for persisting them.
- Message ordering relies on server-assigned creation timestamps. The system does not need to support client-provided ordering or out-of-order message insertion.
- The chat panel UI will be implemented as either a side panel or a drawer. The exact layout is a design decision that does not affect the functional spec. Both approaches satisfy the requirement as long as the panel coexists with the canvas.
- Chat messages from system senders (e.g., automated notifications) are structurally supported but not actively generated in this feature slice. The sender type enum includes "system" for forward compatibility.
- The structured message JSON field (messageJson) may carry action plan data in agent responses. This feature persists the data as-is; interpreting and acting on action plans is the responsibility of later features (agent suggest/apply in S9/S10).

## Scope Boundaries

### In Scope
- GET endpoint for board chat (thread + messages)
- POST endpoint for sending a user message and receiving an agent response
- Durable persistence of user messages, agent responses, and selection context
- Board chat panel or drawer UI with message history rendering
- Message composer with loading, success, and failure states
- Board lifecycle enforcement for chat (active allows read/write, archived allows read-only, deleted returns not found)

### Explicitly Out of Scope
- Dedicated agent suggest endpoint (covered by S9)
- Dedicated agent apply endpoint (covered by S10)
- Operations polling (covered by S11)
- Recovery features (covered by S12)
- Multiple chat threads per board
- Message editing or deletion
- Chat message pagination beyond initial load
- Real-time streaming of agent responses
- Rich text formatting in chat messages
- File attachments in chat messages
- Chat search or filtering
