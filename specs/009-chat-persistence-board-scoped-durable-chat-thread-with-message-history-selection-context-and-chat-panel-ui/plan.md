# Implementation Plan: Chat Persistence

**Branch**: `009-chat-persistence` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/009-chat-persistence-board-scoped-durable-chat-thread-with-message-history-selection-context-and-chat-panel-ui/spec.md`

## Summary

Deliver board-scoped persistent chat with agent responses for Context Board. Backend adds two new endpoints (`GET /boards/:boardId/chat` and `POST /boards/:boardId/chat/messages`) with message validation, selection context persistence, synchronous agent response generation (stubbable for MVP), board lifecycle enforcement, and the `chat_messages` migration. Plain chat does not mutate board state or increment board revision. Frontend replaces the S3.5 placeholder `ChatSidebar` with a full chat panel showing message history, a message composer with loading/error/duplicate-send protection, selection context capture from the board store, and a subtle selection context indicator on messages. The chat panel is open by default on board entry. Agent failure results in only the user message being persisted; the error is shown ephemerally.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS for backend, browser for frontend)
**Primary Dependencies**: Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend
**Storage**: PostgreSQL 15+ (chat_threads + chat_messages tables); Zustand store (frontend chat state)
**Testing**: Vitest + Supertest (backend unit/integration/contract); Vitest + React Testing Library (frontend unit); Playwright (frontend e2e)
**Target Platform**: Linux server/container (backend), modern desktop browsers (frontend)
**Project Type**: Full-stack web application (modular monolith backend + SPA frontend)
**Performance Goals**: Chat history load < 2s for 200 messages (SC-002); message send round-trip < 5s excluding agent processing (SC-001); p50 chat reads < 150ms; p50 message persist < 250ms
**Constraints**: Message text max 20,000 chars; chat does NOT increment board revision; single-user MVP; agent stub acceptable; initial load returns up to 200 messages; all limits in config
**Scale/Scope**: Single user; 2 new API endpoints; 1 new DB migration; ~12 new/modified backend files; ~10 new/modified frontend files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | Messages persisted server-side. Frontend renders from backend response (FR-001, FR-002, FR-012). Chat history loaded from backend on board entry. |
| II | Revision as Sync Primitive | PASS | Plain chat MUST NOT increment board revision (FR-007, SC-005). Chat is a non-revision flow — no revision bump, no operations log entry. |
| III | Operations-First Mutation | N/A | Chat messages are append-only records in their own table, not board-state mutations. No operations log entries needed. Constitution principle III applies to "durable state changes" to board entities; chat messages are a separate persistence domain. |
| IV | Suggest/Apply Separation | N/A | No agent suggest/apply in this slice. Agent response is plain chat only (messageJson may carry action plan data but it is not interpreted or applied in S8). |
| V | Atomic Batch Durability | PASS | Message send persists user message in a transaction. Agent response is persisted separately. If agent fails, user message still exists; no partial board state. |
| VI | Contract-First Implementation | PASS | OpenAPI already defines chat endpoints (api.md §10). Implementation follows existing contract shapes. Zod schemas will match. |
| VII | Vertical Slice Testability | PASS | 5 user stories independently testable. Slice includes backend (endpoints + validation + persistence) + frontend (panel + composer + history) + tests. |
| VIII | Modular Monolith | PASS | New `chat.controller.ts`, `chat.service.ts`, extends existing `chat-threads.repo.ts`, new `chat-messages.repo.ts`. Follows established layering. Agent stub lives in a thin `agent/` module. |
| IX | Correctness Over Optimization | PASS | All message validation runs before persist. Selection context validated as object shape. Board lifecycle checked before accepting messages. |
| X | Explicit Budgets | PASS | Message text limit (20,000 chars), initial load limit (200 messages), agent timeout budget, chat rate limits — all in `config/limits.ts` and `config/env.ts`. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/009-chat-persistence-board-scoped.../
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── chat-endpoints.md       # Phase 1 output — API endpoint contracts
└── checklists/
    └── requirements.md         # From /speckit.specify + /speckit.clarify
```

### Source Code (repository root)

```text
backend/
  src/
    config/
      limits.ts                             # MODIFIED — add chat limits
      env.ts                                # MODIFIED — add AGENT_TIMEOUT_MS, CHAT_RATE_LIMIT
    db/
      migrations/
        009_create_chat_messages.sql         # NEW — chat_messages table DDL
    http/
      router.ts                             # MODIFIED — register chat routes
      controllers/
        chat.controller.ts                  # NEW — get chat, send message handlers
    schemas/
      chat.schemas.ts                       # NEW — Zod schemas for chat message request/response
    services/
      chat.service.ts                       # NEW — get history, send message orchestration
    domain/
      validation/
        chat-rules.ts                       # NEW — message text length, selection context shape, board lifecycle
    repos/
      chat-threads.repo.ts                  # EXISTING — findByBoardId already implemented
      chat-messages.repo.ts                 # NEW — insert message, find messages by thread
    agent/
      agent-stub.ts                         # NEW — stubbable agent response generator
  tests/
    unit/
      chat-rules.unit.test.ts              # NEW
    integration/
      chat.integration.test.ts             # NEW — message persistence, lifecycle enforcement
    contract/
      chat.contract.test.ts                # NEW — HTTP endpoint contracts

frontend/
  src/
    api/
      chat.api.ts                           # NEW — getChatHistory, sendMessage
    store/
      board.store.ts                        # MODIFIED — add chat state, message actions
      types.ts                              # MODIFIED — add ChatMessage, ChatState types
    components/
      layout/
        ChatSidebar.tsx                     # MODIFIED — replace placeholder with real chat panel
      chat/
        MessageList.tsx                     # NEW — chronological message history rendering
        MessageBubble.tsx                   # NEW — user/agent message with sender attribution
        SelectionBadge.tsx                  # NEW — selection context indicator on messages
        MessageComposer.tsx                 # NEW — text input + send button + loading/error states
    hooks/
      useChat.ts                            # NEW — chat load, send, error handling, selection context capture
  tests/
    unit/
      chat.unit.test.ts                    # NEW
```

**Structure Decision**: Full-stack slice following established patterns. Backend adds one controller, one service, one new repo (`chat-messages.repo.ts`), extends existing chat-threads repo, adds domain validation rules, and introduces a thin agent stub module. Frontend replaces the `ChatSidebar` placeholder with real chat components and adds a chat hook for send/load logic. No new architectural layers introduced.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | Messages persisted server-side. Frontend renders from backend response. History loaded from server on board entry. |
| II | Revision as Sync Primitive | PASS | PASS | Chat service explicitly does NOT call `withBoardMutation`. No revision bump. No operations log. |
| III | Operations-First Mutation | N/A | N/A | Chat messages are not board-state mutations. They have their own append-only persistence in `chat_messages`. |
| IV | Suggest/Apply Separation | N/A | N/A | No suggest/apply flows. Agent stub returns plain text only. |
| V | Atomic Batch Durability | PASS | PASS | User message persisted in transaction. Agent response persisted in separate call. Failure of agent does not roll back user message (by design per clarification). |
| VI | Contract-First Implementation | PASS | PASS | `contracts/chat-endpoints.md` documents request/response shapes. Zod schemas match OpenAPI definitions from api.md §10. |
| VII | Vertical Slice Testability | PASS | PASS | Backend: unit (chat-rules), integration (message persistence + lifecycle), contract (HTTP). Frontend: unit (chat hook), e2e (Playwright send/load). |
| VIII | Modular Monolith | PASS | PASS | `chat.controller.ts` → `chat.service.ts` → repos. `agent/agent-stub.ts` isolated. No cross-cutting changes to existing mutation infrastructure. |
| IX | Correctness Over Optimization | PASS | PASS | Message validated before persist. Board lifecycle checked. Selection context validated as object. No caching. |
| X | Explicit Budgets | PASS | PASS | Message text limit (20,000), message load limit (200), agent timeout in config. Chat endpoint rate limits defined. |

**Post-design gate result**: PASS — no violations.

## Complexity Tracking

No constitution violations to justify.
