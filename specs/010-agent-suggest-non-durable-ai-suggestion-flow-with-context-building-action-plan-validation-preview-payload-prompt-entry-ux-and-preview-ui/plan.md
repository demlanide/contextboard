# Implementation Plan: Agent Suggest

**Branch**: `010-agent-suggest` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/010-agent-suggest-.../spec.md`

## Summary

Deliver the non-durable agent suggest flow for Context Board. Backend adds a new endpoint (`POST /boards/:boardId/agent/actions` in suggest mode) that builds a sanitized, truncated context snapshot from board state, calls the LLM with retry/timeout policy, validates the returned action plan against the allowed schema and current board state, generates preview metadata, and persists chat messages — all without mutating board state or incrementing revision. The existing `agent-stub.ts` is replaced with a full agent module containing a context builder, sanitizer, LLM client wrapper, output validator, and preview builder. Frontend extends the existing chat panel with a suggest mode toggle, wires the suggest endpoint through a new API client, adds an agent store slice for suggestion/preview state (kept separate from confirmed board state), renders a canvas preview overlay for proposed changes with visually distinct treatment, and displays an action summary list in the chat panel. Dismiss, retry, and stale-suggestion indicators round out the UX. Suggest never increments board revision and never writes operations log entries.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS for backend, browser for frontend)
**Primary Dependencies**: Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend; OpenAI SDK or fetch-based LLM client (stubbable)
**Storage**: PostgreSQL 15+ (reads existing boards/nodes/edges/assets/chat tables; writes chat_messages only); Zustand store (frontend agent/preview state)
**Testing**: Vitest + Supertest (backend unit/integration/contract); Vitest + React Testing Library (frontend unit); Playwright (frontend e2e)
**Target Platform**: Linux server/container (backend), modern desktop browsers (frontend)
**Project Type**: Full-stack web application (modular monolith backend + SPA frontend)
**Performance Goals**: Suggest p50 < 4s, p95 < 12s (NFR); context build for 5,000 nodes < 2s (SC-008); 20s hard timeout (NFR); end-to-end prompt-to-render < 15s for typical boards (SC-001)
**Constraints**: 18s total LLM budget with 1 retry max; max 200 action items per plan; suggest MUST NOT increment revision; suggest MUST NOT write operations; all limits in config; single-user MVP
**Scale/Scope**: Single user; 1 new API endpoint; 0 new DB migrations; ~15 new/modified backend files; ~15 new/modified frontend files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | Suggest reads board state from DB. Action plan validated server-side before returning to client. Frontend renders preview from server-validated response (FR-001, FR-008). |
| II | Revision as Sync Primitive | PASS | Suggest MUST NOT increment board revision (FR-002, SC-002). No revision bump, no operations log entry. Preview is ephemeral client state. |
| III | Operations-First Mutation | N/A | Suggest is non-durable for board state. No board entities are created, updated, or deleted. Chat message persistence uses the existing append-only pattern from S8 (not a board-state mutation). |
| IV | Suggest/Apply Separation | PASS | This is the suggest half of the separation. Suggest MUST NOT mutate durable board state (FR-001, FR-002). Invalid plans are rejected entirely (FR-013). Apply is explicitly out of scope (S10). |
| V | Atomic Batch Durability | N/A | No batch writes to board state. Chat messages are persisted using the existing S8 pattern. |
| VI | Contract-First Implementation | PASS | OpenAPI already defines `POST /boards/{boardId}/agent/actions` with `AgentActionsRequest`, `AgentActionsResponse`, `ActionPlanItem`, and `Preview` schemas. Implementation follows existing contract shapes. |
| VII | Vertical Slice Testability | PASS | 6 user stories independently testable. Slice includes backend (context builder + LLM client + validator + endpoint) + frontend (suggest mode + preview overlay + action list) + tests. |
| VIII | Modular Monolith | PASS | New files extend `backend/src/agent/` module (context-builder, sanitizer, llm-client, output-validator, preview-builder). New `agent.controller.ts` and `agent.service.ts` follow established layering. LLM concerns stay in agent module. |
| IX | Correctness Over Optimization | PASS | Full action plan validation against current DB state before returning (FR-007, FR-013). Context sanitization before model call (FR-005). No shortcuts for faster suggest at the expense of validation. |
| X | Explicit Budgets | PASS | 18s total suggest budget, 12s single LLM call timeout, 1 retry max, 200 action item limit, prompt max length, context token budgets — all in `config/limits.ts` and `config/env.ts` (FR-011, FR-014, FR-016). |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/010-agent-suggest-.../
├── plan.md                              # This file
├── research.md                          # Phase 0 output
├── data-model.md                        # Phase 1 output
├── quickstart.md                        # Phase 1 output
├── contracts/
│   └── agent-suggest-endpoint.md        # Phase 1 output — suggest endpoint contract
└── checklists/
    └── requirements.md                  # From /speckit.specify + /speckit.clarify
```

### Source Code (repository root)

```text
backend/
  src/
    config/
      limits.ts                                  # MODIFIED — add agent suggest limits
      env.ts                                     # MODIFIED — add LLM config vars
    http/
      router.ts                                  # MODIFIED — register agent routes
      controllers/
        agent.controller.ts                      # NEW — suggest endpoint handler
    schemas/
      agent.schemas.ts                           # NEW — Zod schemas for suggest request/response, action plan items
    services/
      agent.service.ts                           # NEW — suggest orchestration (context → LLM → validate → preview → persist)
    domain/
      validation/
        action-plan-rules.ts                     # NEW — action type allow-list, reference validation, locked-node check
    agent/
      agent-stub.ts                              # REMOVED — replaced by real agent module
      context-builder.ts                         # NEW — AgentContextSnapshot construction with priority/truncation
      sanitizer.ts                               # NEW — PII/secret redaction with summary
      llm-client.ts                              # NEW — LLM call with timeout, retry, JSON repair
      output-validator.ts                        # NEW — validate model JSON against action plan schema
      preview-builder.ts                         # NEW — compute affected IDs, temp IDs from valid plan
      types.ts                                   # NEW — AgentContextSnapshot, LLMResponse, NodeProjection types
    repos/
      nodes.repo.ts                              # MODIFIED — add spatial/viewport query helpers for context builder
      edges.repo.ts                              # MODIFIED — add edge query for context builder
      assets.repo.ts                             # MODIFIED — add asset metadata query for referenced assets
  tests/
    unit/
      context-builder.unit.test.ts               # NEW — truncation, priority, determinism
      sanitizer.unit.test.ts                     # NEW — redaction patterns, summary
      output-validator.unit.test.ts              # NEW — allow-list, shape, reference checks
      action-plan-rules.unit.test.ts             # NEW — locked node, cross-board, deleted entity
      preview-builder.unit.test.ts               # NEW — affected IDs computation
    integration/
      agent-suggest.integration.test.ts          # NEW — full suggest flow, no revision change, chat persistence
    contract/
      agent-suggest.contract.test.ts             # NEW — HTTP endpoint contract against OpenAPI

frontend/
  src/
    api/
      agent.api.ts                               # NEW — submitSuggest API client
    store/
      board.store.ts                             # MODIFIED — add agent slice (suggestion, preview, suggestStatus)
      types.ts                                   # MODIFIED — add AgentSuggestion, SuggestPreview, ActionPlanItem types
    components/
      chat/
        MessageComposer.tsx                      # MODIFIED — add suggest mode toggle
        SuggestModeToggle.tsx                    # NEW — toggle between chat and suggest modes
        ActionSummaryList.tsx                    # NEW — structured list of planned actions
        SuggestLoadingIndicator.tsx              # NEW — suggest-specific loading state
      canvas/
        PreviewOverlay.tsx                       # NEW — renders preview nodes/edges with distinct styling
        PreviewNode.tsx                          # NEW — single preview node with visual treatment
        PreviewEdge.tsx                          # NEW — single preview edge with visual treatment
        StaleBanner.tsx                          # NEW — stale suggestion indicator
      board/
        BoardScreen.tsx                          # MODIFIED — integrate preview overlay layer
    hooks/
      useSuggest.ts                              # NEW — suggest submit, dismiss, retry, stale detection
  tests/
    unit/
      suggest.unit.test.ts                       # NEW — store actions, preview state separation
```

**Structure Decision**: Full-stack slice following established patterns from S8. Backend extends the `agent/` module from stub to full context-builder/validator/LLM-client architecture. New `agent.controller.ts` and `agent.service.ts` follow the same controller→service→repo layering. Frontend adds an agent store slice alongside confirmed board state (never mixed), a canvas preview overlay layer, and suggest-mode UX in the existing chat panel. No new architectural layers introduced.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | Context built from DB reads. Action plan validated server-side. Preview metadata computed server-side. Client renders from server-validated response. |
| II | Revision as Sync Primitive | PASS | PASS | `agent.service.ts` explicitly does NOT call `withBoardMutation`. No revision bump. No operations log. Chat messages use S8 pattern. |
| III | Operations-First Mutation | N/A | N/A | No board-state mutations. Chat persistence is append-only in `chat_messages` (same as S8). |
| IV | Suggest/Apply Separation | PASS | PASS | Suggest flow reads board state, calls LLM, validates output, returns preview. Zero board writes. Apply is S10. Entire plan rejected on any invalid item (clarification). |
| V | Atomic Batch Durability | N/A | N/A | No batch writes to board entities. |
| VI | Contract-First Implementation | PASS | PASS | `contracts/agent-suggest-endpoint.md` documents request/response shapes matching OpenAPI `AgentActionsRequest`/`AgentActionsResponse`. Zod schemas in `agent.schemas.ts` match. |
| VII | Vertical Slice Testability | PASS | PASS | Backend: unit (context-builder, sanitizer, validator, plan-rules, preview-builder), integration (full suggest flow), contract (HTTP). Frontend: unit (store), e2e (Playwright suggest-preview-dismiss). |
| VIII | Modular Monolith | PASS | PASS | `agent.controller.ts` → `agent.service.ts` → agent module (context-builder, sanitizer, llm-client, output-validator, preview-builder) + repos for reads. LLM concerns isolated in `agent/`. |
| IX | Correctness Over Optimization | PASS | PASS | Full validation: prompt validated, context sanitized, LLM output validated against schema AND current board state (references, locked nodes, same-board), entire plan rejected on any invalid item. |
| X | Explicit Budgets | PASS | PASS | LLM timeout (12s), retry (1), total budget (18s), suggest hard timeout (20s), action limit (200), prompt max length, context token budget (8k total / 6k content), node caps (50/100/200), rate limit (12/min) — all in config. |

**Post-design gate result**: PASS — no violations.

## Complexity Tracking

No constitution violations to justify.
