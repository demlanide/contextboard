# Tasks: Chat Persistence

**Input**: Design documents from `/specs/009-chat-persistence-board-scoped.../`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/tests/`
- **Frontend**: `frontend/src/`, `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add configuration, create DB migration, and establish the agent stub that all chat user stories depend on.

- [x] T001 Add chat limits to backend/src/config/limits.ts — chat.messageText { min: 1, max: 20_000 }, chat.messagesPerLoad: 200, chat.selectionMaxNodeIds: 100, chat.selectionMaxEdgeIds: 100
- [x] T002 Add agent timeout config to backend/src/config/env.ts — AGENT_TIMEOUT_MS (default 12000), CHAT_REQUEST_TIMEOUT_MS (default 20000)
- [x] T003 Create database migration backend/src/db/migrations/009_create_chat_messages.sql — chat_messages table with id, thread_id, sender_type, message_text, message_json, selection_context columns, sender_type CHECK constraint, and indexes (thread_id+created_at, sender_type) per data-model.md

**Checkpoint**: Configuration extended, migration ready to run.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend modules that MUST be complete before any user story endpoint can work — schemas, repository, validation rules, agent stub, and frontend types/API client.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Create Zod schemas in backend/src/schemas/chat.schemas.ts — SendMessageRequest (message: string 1–20000 chars, selectionContext: optional object with selectedNodeIds string[], selectedEdgeIds string[], viewport {x,y,zoom}), ChatMessageResponse shape (id, threadId, senderType, messageText, messageJson, selectionContext, createdAt), GetChatResponse (thread + messages[]), SendMessageResponse (userMessage + agentMessage nullable)
- [x] T005 [P] Create chat messages repository in backend/src/repos/chat-messages.repo.ts — insertMessage(client, {id, thread_id, sender_type, message_text, message_json, selection_context}): ChatMessage, findByThreadId(client, threadId, limit): ChatMessage[] ordered by created_at ASC; typed row-to-ChatMessage mapping following chat-threads.repo.ts pattern
- [x] T006 [P] Create chat validation rules in backend/src/domain/validation/chat-rules.ts — validateMessageText (length limits from config), validateSelectionContext (object shape, array lengths), assertBoardChatWritable (board exists + status=active, throws BOARD_NOT_FOUND or BOARD_ARCHIVED), assertThreadExists (throws CHAT_THREAD_NOT_FOUND)
- [x] T007 [P] Create agent stub in backend/src/agent/agent-stub.ts — export generateAgentResponse({ boardId, messageText, selectionContext, boardContext? }): Promise<{ text: string, messageJson: object }> returning canned acknowledgment; wrapping in a configurable timeout from AGENT_TIMEOUT_MS; designed as drop-in replacement point for real LLM in S9
- [x] T008 [P] Create chat API client in frontend/src/api/chat.api.ts — getChatHistory(boardId): Promise<GetChatResponse>, sendMessage(boardId, message, selectionContext?): Promise<SendMessageResponse>; use existing api/client.ts base
- [x] T009 [P] Add chat types to frontend/src/store/types.ts — ChatMessage interface (id, threadId, senderType, messageText, messageJson, selectionContext, createdAt), ChatState interface (messages: ChatMessage[], sendStatus: 'idle'|'sending'|'error', loadStatus: 'idle'|'loading'|'ready'|'error', draftText: string, lastError: string|null), add chatState to BoardStore interface

**Checkpoint**: Foundation ready — schemas, repo, validation, agent stub, frontend types, and API client all available for endpoint implementation.

---

## Phase 3: User Story 1 — Load Chat History on Board Entry (Priority: P1) 🎯 MVP

**Goal**: User opens a board and sees previous chat messages displayed in chronological order in the chat panel. Empty boards show an empty state with the composer ready.

**Independent Test**: Create a board, insert messages via POST endpoint (or directly via DB), reload the board, and verify all messages appear in chronological order with correct sender attribution.

### Implementation for User Story 1

- [x] T010 [US1] Implement getChatHistory in backend/src/services/chat.service.ts — withTransaction: load board (assert exists, not deleted), load chat thread (assert exists), load messages via chat-messages.repo.findByThreadId with limit from config, return { thread, messages }
- [x] T011 [US1] Implement GET /boards/:boardId/chat handler in backend/src/http/controllers/chat.controller.ts — validate boardId UUID, call chat.service.getChatHistory, return successResponse({ thread, messages }) or errorResponse; handle BOARD_NOT_FOUND (404), CHAT_THREAD_NOT_FOUND (404)
- [x] T012 [US1] Register GET /boards/:boardId/chat route in backend/src/http/router.ts — add route before the boardId catch-all GET route
- [x] T013 [US1] Add chat state and loadHistory action to frontend/src/store/board.store.ts — initialize chatState with defaults, add loadChatHistory(messages) action that sets chatState.messages and loadStatus, add setChatLoadStatus action, add resetChat in the existing reset() flow
- [x] T014 [P] [US1] Create MessageBubble component in frontend/src/components/chat/MessageBubble.tsx — render single message with sender attribution (user right-aligned, agent left-aligned), display messageText, timestamp, visual distinction between user and agent styles (different background colors)
- [x] T015 [US1] Create MessageList component in frontend/src/components/chat/MessageList.tsx — render array of ChatMessages using MessageBubble, auto-scroll to bottom on new messages, show empty state when no messages, show loading spinner when loadStatus=loading
- [x] T016 [US1] Replace ChatSidebar placeholder with real chat panel in frontend/src/components/layout/ChatSidebar.tsx — remove "Chat coming in S8" placeholder, integrate MessageList, load chat history on mount via useChat hook (T021 in US2) or direct API call, keep existing open/close toggle behavior

**Checkpoint**: `GET /api/boards/:boardId/chat` returns thread + messages. Chat panel renders message history on board entry. Empty boards show empty state.

---

## Phase 4: User Story 2 — Send a Chat Message and Receive a Response (Priority: P1)

**Goal**: User types a message, sends it, and receives an agent response. Both messages are persisted and visible after reload. Board state remains unchanged.

**Independent Test**: Open a board, send a message via the chat composer, verify user message appears immediately with loading indicator, agent reply appears, reload page and confirm both messages persist. Verify board revision unchanged.

### Implementation for User Story 2

- [x] T017 [US2] Implement sendMessage in backend/src/services/chat.service.ts — withTransaction: validate board (exists, active, not archived), load thread, validate message text + selection context via chat-rules, persist user message via chat-messages.repo.insertMessage with sender_type=user; then outside transaction: call agent-stub.generateAgentResponse wrapped in try/catch; on success: persist agent message in separate transaction, return { userMessage, agentMessage }; on agent failure: return { userMessage, agentMessage: null } with error info
- [x] T018 [US2] Implement POST /boards/:boardId/chat/messages handler in backend/src/http/controllers/chat.controller.ts — parse body with SendMessageRequest schema, call chat.service.sendMessage, return successResponse({ userMessage, agentMessage }) with 200; if agentMessage is null, include error in envelope per contracts/chat-endpoints.md agent failure response shape; handle BOARD_NOT_FOUND (404), BOARD_ARCHIVED (409), VALIDATION_ERROR (422)
- [x] T019 [US2] Register POST /boards/:boardId/chat/messages route in backend/src/http/router.ts — no idempotency middleware needed per research.md R4
- [x] T020 [US2] Create MessageComposer component in frontend/src/components/chat/MessageComposer.tsx — textarea input with send button, disable send while sendStatus=sending (FR-015), show loading indicator during send, preserve draft text on error (FR-016), clear input on success, submit on Enter key (Shift+Enter for newline)
- [x] T021 [US2] Create useChat hook in frontend/src/hooks/useChat.ts — loadHistory(boardId): fetch via chat.api.getChatHistory and update store; sendMessage(boardId, text): set sendStatus=sending, call chat.api.sendMessage, on success append both messages to store + set sendStatus=idle, on error set sendStatus=error + preserve lastError + show ephemeral error; expose messages, sendStatus, loadStatus, draftText, sendMessage, loadHistory
- [x] T022 [US2] Integrate MessageComposer and useChat into ChatSidebar in frontend/src/components/layout/ChatSidebar.tsx — wire useChat hook for load/send, render MessageComposer below MessageList, call loadHistory on component mount with boardId, append new messages to list after successful send

**Checkpoint**: Full send/receive flow works end-to-end. User and agent messages persist after reload. Board revision unchanged. Agent failure shows ephemeral error with user message preserved.

---

## Phase 5: User Story 3 — Send a Message with Selection Context (Priority: P2)

**Goal**: When the user has nodes or edges selected on the canvas and sends a chat message, the selection state is captured and stored with the message. Messages with selection context display a subtle indicator.

**Independent Test**: Select nodes on the board, send a message, verify the stored message includes selection context (node IDs, edge IDs, viewport). Reload and confirm context persists. Verify the selection badge appears on the message.

### Implementation for User Story 3

- [x] T023 [US3] Add selection context capture to useChat hook in frontend/src/hooks/useChat.ts — on sendMessage, read ui.selectedNodeIds, ui.selectedEdgeId (convert to array), and board viewport from board store; package as SelectionContext object; pass to chat.api.sendMessage if any selection exists
- [x] T024 [P] [US3] Create SelectionBadge component in frontend/src/components/chat/SelectionBadge.tsx — render a subtle label (e.g., "3 nodes, 1 edge selected") derived from selectionContext.selectedNodeIds.length and selectedEdgeIds.length; only render when selectionContext has non-empty arrays; use small muted text styling
- [x] T025 [US3] Integrate SelectionBadge into MessageBubble in frontend/src/components/chat/MessageBubble.tsx — render SelectionBadge below message text for messages where selectionContext has content; only show for user messages (agent messages don't carry selection context)

**Checkpoint**: Selection context captured on send, persisted in backend, visible as badge on messages in chat history.

---

## Phase 6: User Story 4 — Chat Panel Interaction and Usability (Priority: P2)

**Goal**: Chat panel is open by default, preserves state across toggle, provides clear loading/error feedback, and coexists with the canvas without obstruction.

**Independent Test**: Open a board — panel is open by default. Close and reopen — messages preserved without re-fetch. Send a failing message — error shown, draft preserved. Verify canvas is still interactive with panel open.

### Implementation for User Story 4

- [x] T026 [US4] Change chatSidebarOpen default to true in frontend/src/store/board.store.ts — update initial UIState.chatSidebarOpen from false to true so chat panel opens by default on board entry per clarification
- [x] T027 [US4] Add loading and error states to ChatSidebar in frontend/src/components/layout/ChatSidebar.tsx — show LoadingSpinner (from shared/) when chatState.loadStatus=loading, show ErrorMessage (from shared/) with retry button when loadStatus=error, show inline error toast when sendStatus=error using chatState.lastError text
- [x] T028 [US4] Ensure chat state preserved across panel toggle in frontend/src/store/board.store.ts — verify toggleChatSidebar only changes ui.chatSidebarOpen without clearing chatState.messages; add guard in loadHistory to skip fetch if messages already loaded and loadStatus=ready

**Checkpoint**: Panel open by default. Toggle preserves messages. Loading/error states render correctly. Canvas remains interactive.

---

## Phase 7: User Story 5 — Chat Respects Board Lifecycle Rules (Priority: P3)

**Goal**: Active boards allow full chat. Archived boards show history but reject sends. Deleted boards return not-found for all chat requests.

**Independent Test**: Create boards in active, archived, deleted states. Verify: active allows read+write; archived allows read, rejects write with clear error; deleted returns 404 for both.

### Implementation for User Story 5

- [x] T029 [US5] Verify backend lifecycle enforcement in backend/src/services/chat.service.ts — confirm getChatHistory rejects deleted boards (BOARD_NOT_FOUND) but allows archived boards; confirm sendMessage rejects both archived (BOARD_ARCHIVED 409) and deleted (BOARD_NOT_FOUND 404) boards via chat-rules.assertBoardChatWritable
- [x] T030 [US5] Disable message composer for archived boards in frontend/src/components/chat/MessageComposer.tsx — accept disabled prop, when board.status=archived render composer in disabled state with explanatory text ("This board is archived. Chat is read-only."); wire disabled prop from ChatSidebar based on board.status from store
- [x] T031 [US5] Handle deleted board 404 in useChat hook in frontend/src/hooks/useChat.ts — on loadHistory 404 error, set loadStatus=error with user-friendly message; on sendMessage 409 (BOARD_ARCHIVED), show "Board is read-only" error without retaining draft for retry

**Checkpoint**: Lifecycle rules enforced end-to-end. Archived boards show history + disabled composer. Deleted boards show not-found error.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Tests, structured logging, and quickstart validation.

- [x] T032 [P] Write unit tests for chat validation rules in backend/tests/unit/chat-rules.unit.test.ts — test message text length limits (empty, 1 char, 20001 chars), selection context shape validation (valid, missing fields, invalid types), board lifecycle assertions (active, archived, deleted)
- [x] T033 Write integration tests for chat endpoints in backend/tests/integration/chat.integration.test.ts — test GET chat (200 with messages, 200 empty, 404 deleted board), POST message (200 with user+agent, 200 with selection context, 409 archived, 404 deleted, 422 empty message, 422 overlong message), verify board revision unchanged after message send
- [x] T034 Write contract tests for chat endpoints in backend/tests/contract/chat.contract.test.ts — GET /boards/:boardId/chat response shape matches contracts/chat-endpoints.md, POST /boards/:boardId/chat/messages request/response shapes match contract, agent failure response shape matches contract
- [x] T035 [P] Add structured logging for chat operations in backend/src/services/chat.service.ts — log boardId, threadId, messageId, senderType on message persist; log agent call duration and success/failure; log board lifecycle rejections
- [x] T036 Run quickstart.md verification — execute all curl commands from specs/009-chat-persistence-board-scoped.../quickstart.md against a running local instance and confirm expected responses

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational phase completion
  - US1 (load history) can start immediately after Foundational
  - US2 (send message) depends on US1 (needs GET endpoint + MessageList + chat store to exist)
  - US3 (selection context) depends on US2 (needs send flow to add context to)
  - US4 (panel UX) depends on US1 + US2 (needs panel and composer to exist)
  - US5 (lifecycle) depends on US2 (needs send flow to enforce against)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — No story dependencies
- **US2 (P1)**: Depends on US1 (needs chat service, store state, and MessageList)
- **US3 (P2)**: Depends on US2 (needs working send flow)
- **US4 (P2)**: Depends on US1 + US2 (needs panel + composer to polish)
- **US5 (P3)**: Depends on US2 (needs send flow for lifecycle rejection)

### Within Each User Story

- Schemas/repos before services
- Services before controllers
- Controllers before route registration
- Backend before frontend (for endpoints the frontend calls)

### Parallel Opportunities

- T004 + T005 + T006 + T007 + T008 + T009 (all foundational) can run in parallel
- T014 (MessageBubble) can run in parallel with T010–T012 (backend)
- T023 + T024 (selection hook + badge) can run in parallel
- T032 + T035 (unit tests + logging) can run in parallel
- US3 and US4 can run in parallel after US2 completes

---

## Parallel Example: Foundational Phase

```text
# All these can run simultaneously (different files, no dependencies):
Task T004: Zod schemas in backend/src/schemas/chat.schemas.ts
Task T005: Chat messages repo in backend/src/repos/chat-messages.repo.ts
Task T006: Chat rules in backend/src/domain/validation/chat-rules.ts
Task T007: Agent stub in backend/src/agent/agent-stub.ts
Task T008: Chat API client in frontend/src/api/chat.api.ts
Task T009: Chat types in frontend/src/store/types.ts
```

## Parallel Example: After US2 Completes

```text
# US3 and US4 can run simultaneously:
Task T023-T025 (US3: selection context capture + badge)
Task T026-T028 (US4: panel UX defaults + loading/error states)
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Load History)
4. Complete Phase 4: User Story 2 (Send + Receive)
5. **STOP and VALIDATE**: Send a message, reload, verify persistence. Check board revision unchanged.

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Load History) → Test GET endpoint + chat panel rendering → First milestone
3. US2 (Send + Receive) → Test full send/receive flow + persistence → Core MVP
4. US3 (Selection Context) → Test context capture + badge display → Context enrichment
5. US4 (Panel UX) → Test defaults + error states → UX polish
6. US5 (Lifecycle) → Test archived/deleted enforcement → Safety verified
7. Polish → Tests + logging + quickstart validation → Ship-ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Chat does NOT use withBoardMutation — uses withTransaction only; no revision bump, no operations log, no advisory lock
- Agent stub is a thin module designed for drop-in replacement in S9
- ChatSidebar.tsx already exists as a placeholder; T016 replaces it with real content
