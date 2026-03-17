# Implementation Plan: Edge CRUD

**Branch**: `006-edge-crud` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/006-edge-crud/spec.md`

## Summary

Deliver full-stack edge CRUD for Context Board: users can create, update, and delete edges (relationships) between nodes via three new API endpoints and a visual drag-to-connect canvas interaction. Backend adds an edges controller, edges service, edge domain validation, and extends the existing edges repo with insert/update/soft-delete operations — all wired through `withBoardMutation` for atomic revision and operations logging. Frontend adds connection handles on nodes, a preview edge during drag, valid/invalid target feedback, edge rendering on the canvas, and edge mutation hooks with server reconciliation and rollback-safe behavior.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS for backend, browser for frontend)
**Primary Dependencies**: Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend
**Storage**: PostgreSQL 15+ (backend source of truth); Zustand normalized store (frontend confirmed state)
**Testing**: Vitest + Supertest (backend unit/integration/contract); Vitest + React Testing Library (frontend unit); Playwright (frontend e2e)
**Target Platform**: Linux server/container (backend), modern desktop browsers (frontend)
**Project Type**: Full-stack web application (modular monolith backend + SPA frontend)
**Performance Goals**: p50 < 250ms edge mutations; p50 < 150ms reads; < 1s user-perceived edge creation; instantaneous preview feedback during drag
**Constraints**: 5s hard timeout mutations; 6s hard timeout hydration; single-user MVP; no auth; all limits in config
**Scale/Scope**: Single user; edge count bounded by node count (up to 5,000 nodes, many-to-many edges); 3 new API endpoints; ~10 new/modified backend files; ~15 new/modified frontend files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | All edge mutations go through backend API. Frontend uses optimistic UI but reconciles from server response. FR-016 explicitly states server is authoritative. |
| II | Revision as Sync Primitive | PASS | Every edge create/update/delete increments board revision exactly once via `withBoardMutation` (FR-010). |
| III | Operations-First Mutation | PASS | Every edge mutation writes operation log entries in the same transaction via `buildOperation` (FR-011). Operation types `create_edge`, `update_edge`, `delete_edge` already exist in `operation-factory.ts`. |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice. |
| V | Atomic Batch Durability | PASS | Edge mutations are atomic via `withBoardMutation`. Node delete + cascade edge soft-delete already atomic in nodes.service. |
| VI | Contract-First Implementation | PASS | OpenAPI spec already defines `CreateEdgeRequest`, `UpdateEdgeRequest`, `DeleteEdgeResponse`, `EdgeResponse`, and `Edge` schemas. Implementation follows existing contract. |
| VII | Vertical Slice Testability | PASS | 5 user stories are independently testable. Slice includes API + validation + persistence + revision + operations + frontend rendering + interaction + tests. |
| VIII | Modular Monolith | PASS | Backend adds `edges.controller.ts`, `edges.service.ts`, extends `edges.repo.ts`, adds `edge-rules.ts`. Follows existing controller → service → repo layering. |
| IX | Correctness Over Optimization | PASS | Backend validates all mutation preconditions (board editability, node existence, same-board, self-loop, active-node) before commit. Frontend preview is convenience only. |
| X | Explicit Budgets | PASS | Edge label limit (1,000 chars), mutation timeout (5s) in config/limits. Rate limits per constitution (60 req/min mutations). |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-edge-crud/
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── edge-endpoints.md       # Phase 1 output — API endpoint contracts
└── checklists/
    └── requirements.md         # From /speckit.specify + /speckit.clarify
```

### Source Code (repository root)

```text
backend/
  src/
    config/
      limits.ts                             # MODIFIED — add edge-specific limits
    http/
      router.ts                             # MODIFIED — register edge routes
      controllers/
        edges.controller.ts                 # NEW — create, update, delete handlers
      middleware/
        content-type.ts                     # EXISTING — already handles merge-patch
    schemas/
      edge.schemas.ts                       # NEW — Zod schemas for create/update/delete request + response
      board-state.schemas.ts                # EXISTING — Edge type already defined
    services/
      edges.service.ts                      # NEW — create, update, delete orchestration
    domain/
      validation/
        edge-rules.ts                       # NEW — same-board, active-node, self-loop, existence checks
      patch/
        merge-patch.ts                      # EXISTING — JSON merge-patch utility for JSONB fields
      operations/
        operation-factory.ts                # EXISTING — payloads already typed for edge ops
    repos/
      edges.repo.ts                         # MODIFIED — add findActiveById, insertEdge, updateEdge, softDeleteEdge
    db/
      migrations/
        006_create_board_edges.sql          # EXISTING — table already created
  tests/
    unit/
      edge-rules.unit.test.ts              # NEW
    integration/
      edges.integration.test.ts            # NEW — transactional edge CRUD
    contract/
      edges.contract.test.ts               # NEW — HTTP endpoint contracts

frontend/
  src/
    api/
      edges.api.ts                          # NEW — createEdge, updateEdge, deleteEdge
    store/
      board.store.ts                        # MODIFIED — add edge mutation actions, optimistic UI, reconciliation
      types.ts                              # MODIFIED — add edge mutation state types
    components/
      canvas/
        Canvas.tsx                          # MODIFIED — render edges, connection handles
        edges/
          EdgeRenderer.tsx                  # NEW — renders confirmed edges on canvas
          PreviewEdge.tsx                   # NEW — temporary edge during drag
          ConnectionHandle.tsx              # NEW — drag source on nodes
    hooks/
      useEdgeConnection.ts                  # NEW — drag-to-connect interaction, preview state, target validation
      useEdgeMutations.ts                   # NEW — create, update, delete with server reconciliation
    pages/
      BoardPage.tsx                         # EXISTING — no changes needed
  tests/
    unit/
      edge-mutations.unit.test.ts          # NEW
    e2e/
      edge-crud.e2e.test.ts               # NEW — Playwright: connect, update, delete edges
```

**Structure Decision**: Full-stack slice following established patterns from 005-node-crud. Backend adds one controller, one service, extends existing repo, adds domain validation rules. Frontend extends the existing canvas with edge rendering components and a drag-to-connect interaction layer. No new architectural layers introduced.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | All 3 endpoints validate and persist server-side. Frontend reconciles from response. FR-016 enforced. |
| II | Revision as Sync Primitive | PASS | PASS | `withBoardMutation` handles revision bump for create, update, and delete. |
| III | Operations-First Mutation | PASS | PASS | `buildOperation` writes `create_edge`, `update_edge`, `delete_edge` entries in same transaction. |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows. |
| V | Atomic Batch Durability | PASS | PASS | Individual edge mutations are atomic via `withBoardMutation`. Cascade from node delete already handled in 005. |
| VI | Contract-First Implementation | PASS | PASS | Endpoints follow existing OpenAPI schemas. `contracts/edge-endpoints.md` documents request/response shapes. Zod schemas match OpenAPI. |
| VII | Vertical Slice Testability | PASS | PASS | Backend: unit (edge-rules), integration (transactional CRUD), contract (HTTP). Frontend: unit (mutations), e2e (Playwright). |
| VIII | Modular Monolith | PASS | PASS | New files follow established layering. `edges.service.ts` orchestrates through repos + domain rules. No cross-cutting changes. |
| IX | Correctness Over Optimization | PASS | PASS | All domain validation runs before commit. No caching introduced. |
| X | Explicit Budgets | PASS | PASS | Edge label limit (1,000 chars) in `config/limits.ts`. Mutation timeout (5s) from existing config. |

**Post-design gate result**: PASS — no violations.

## Complexity Tracking

No constitution violations to justify.
