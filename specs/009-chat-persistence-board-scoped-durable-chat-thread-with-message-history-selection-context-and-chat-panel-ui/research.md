# Research: Chat Persistence

## R1: Chat message persistence — separate from board mutations

**Decision**: Chat messages are persisted in `chat_messages` table via `withTransaction` (not `withBoardMutation`). Plain chat does not increment board revision or write operations log entries.

**Rationale**: Constitution Principle II requires that revision increments only for durable board-state mutations. Chat messages are a parallel persistence domain — they store conversation, not board topology. The functional spec (§11.2) and the API reference (§10) both confirm that "plain chat request does not increment board revision." Using `withTransaction` instead of `withBoardMutation` avoids acquiring the board advisory lock, which is unnecessary for append-only message inserts and avoids blocking concurrent board edits during potentially slow agent calls.

**Alternatives considered**:
- `withBoardMutation`: Would acquire advisory lock and increment revision. Rejected because chat does not mutate board state — would violate FR-007 and Constitution Principle II.
- No transaction: Rejected because user message persistence should be atomic with its validation (board existence, lifecycle check).

## R2: Agent response generation — stub architecture

**Decision**: Introduce `backend/src/agent/agent-stub.ts` exporting a `generateAgentResponse(context: AgentContext): Promise<AgentResponse>` function. In MVP, this returns a canned acknowledgment. The function signature accepts board context, selection context, and message text, making it a drop-in replacement point for real LLM integration in S9.

**Rationale**: The spec (Assumptions) states the agent response mechanism "is either available or can be stubbed for MVP testing." A thin stub module keeps agent concerns isolated per Constitution Principle VIII (LLM concerns in agent module). The function signature matches the context-building pattern described in the functional spec (§11.2 steps 4-6).

**Alternatives considered**:
- Inline stub in chat service: Rejected because agent logic should be modular and isolated for S9 replacement.
- Real LLM integration now: Rejected because S8 scope is persistence, not AI quality. LLM integration is S9 territory.
- No agent response at all: Rejected because the API contract requires both `userMessage` and `agentMessage` in the response (api.md §10).

## R3: Agent failure handling — user message persisted, error ephemeral

**Decision**: When agent response generation fails (timeout, error, unavailability), the user message is already persisted. The endpoint returns the user message with an error in the response envelope (agentMessage: null, error populated). No agent message record is created. The frontend shows the error ephemerally.

**Rationale**: Clarification session (2026-03-16) confirmed this approach. Persisting the user message first ensures no data loss. Not persisting a failed agent response keeps the thread clean — error artifacts are transient conditions, not conversation content. On reload, the user sees their message without a response, which accurately represents what happened.

**Alternatives considered**:
- Persist error as system message: Rejected per clarification — would pollute chat history with infrastructure artifacts.
- Roll back user message on agent failure: Rejected — user message is valid content that was deliberately sent.

## R4: Chat endpoint does not use idempotency middleware

**Decision**: The `POST /boards/:boardId/chat/messages` endpoint does not use idempotency middleware.

**Rationale**: Chat messages are append-only. The API contract (api.md §2.6) lists idempotency as "recommended" for specific mutation endpoints (create board, create node, batch, create edge, apply agent actions) — chat messages are not in this list. The frontend prevents duplicate submissions via FR-015, making server-side idempotency unnecessary for MVP single-user chat.

**Alternatives considered**:
- Add idempotency: Overly cautious for append-only single-user messages. Would add complexity without clear benefit since chat doesn't affect board state.

## R5: Initial message load limit — 200 messages

**Decision**: `GET /boards/:boardId/chat` returns the most recent 200 messages ordered by `created_at ASC`. This matches the data model query pattern (data-model.md §19.2) and the success criteria (SC-002).

**Rationale**: The spec explicitly excludes pagination beyond initial load. 200 messages is sufficient for MVP conversational context and aligns with the data model's existing query pattern. The limit is stored in `config/limits.ts`.

**Alternatives considered**:
- Return all messages: Could become slow for very active boards. Rejected to maintain SC-002 (< 2s load time).
- Cursor-based pagination: Out of scope per spec exclusions. Can be added later without schema changes.

## R6: Chat panel default state — open by default

**Decision**: The chat panel is open by default when a user enters a board. The existing `chatSidebarOpen` state in the UI store should default to `true` instead of its current value.

**Rationale**: Clarification session (2026-03-16) confirmed this. The chat panel is a core interaction surface for the board. Starting open ensures discoverability and immediate access to conversation history.

**Alternatives considered**:
- Closed by default: Would prioritize canvas space. Rejected per clarification.

## R7: Selection context capture — from existing board store

**Decision**: The frontend captures selection context from the existing `ui.selectedNodeIds` and `ui.selectedEdgeId` in the board store, plus the current viewport state. This is packaged as a `SelectionContext` object and sent with the message request.

**Rationale**: The board store already tracks selection state (from S4/S5). No new state tracking is needed — just read and package at send time. The selection context is stored as-is (snapshot at send time) per edge case clarification, even if referenced entities no longer exist at read time.

**Alternatives considered**:
- Validate selection entity existence before send: Rejected per edge case — context is a snapshot, not a live reference.
