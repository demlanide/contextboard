# Implementation Plan: Node CRUD

**Branch**: `005-node-crud` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/005-node-crud/spec.md`

## Summary

Deliver the first full-stack editing capability for Context Board: users can create, view, edit, move, resize, and delete sticky, text, and shape nodes on the board canvas with durable backend persistence. Backend adds three node mutation endpoints (create, patch, delete) with per-type content validation, locked-node enforcement, merge-patch semantics, cascade edge soft-delete on node delete, and revision/operation logging via the existing `withBoardMutation` infrastructure. Frontend extends the S3.5 canvas placeholder into a real interactive surface with node rendering by type, a toolbar-driven two-step placement flow, inline text editing with auto-save on blur, drag-to-move, resize handles, optimistic UI with server reconciliation, delete-with-undo-toast, pending/saved/failed state indicators, and basic canvas panning.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS for backend, browser for frontend)
**Primary Dependencies**: Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend
**Storage**: PostgreSQL 15+ (backend source of truth); Zustand normalized store (frontend confirmed state)
**Testing**: Vitest + Supertest (backend unit/integration/contract); Vitest + React Testing Library (frontend unit); Playwright (frontend e2e)
**Target Platform**: Linux server/container (backend), modern desktop browsers (frontend)
**Project Type**: Full-stack web application (modular monolith backend + SPA frontend)
**Performance Goals**: p50 < 250ms node mutations; p50 < 150ms reads; < 2s user-perceived node creation; < 3s board hydration with nodes
**Constraints**: 5s hard timeout mutations; 6s hard timeout hydration; single-user MVP; no auth; all limits in config
**Scale/Scope**: Single user; up to 5,000 nodes per board (soft limit); 3 new API endpoints; ~15 new/modified backend files; ~20 new/modified frontend files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | All node mutations go through backend API. Frontend uses optimistic UI but reconciles from server response (FR-027, FR-028, FR-029). |
| II | Revision as Sync Primitive | PASS | Every node create/update/delete increments board revision exactly once via `withBoardMutation` (FR-018). Delete cascade included in same revision bump. |
| III | Operations-First Mutation | PASS | Every node mutation writes operation log entries in the same transaction via `buildOperation` (FR-019). |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice. |
| V | Atomic Batch Durability | PASS | Node delete + cascade edge soft-delete execute atomically in one transaction. Batch endpoint is out of scope for this slice. |
| VI | Contract-First Implementation | PASS | OpenAPI spec already defines `CreateNodeRequest`, `UpdateNodeRequest`, `DeleteNodeResponse`, and `NodeResponse` schemas. Implementation follows existing contract. |
| VII | Vertical Slice Testability | PASS | 6 user stories are independently testable. Slice includes API + validation + persistence + revision + operations + frontend rendering + interaction + tests. |
| VIII | Modular Monolith | PASS | Backend adds `nodes.controller.ts`, `nodes.service.ts`, extends `nodes.repo.ts`, adds `node-rules.ts`. Follows existing controller → service → repo layering. |
| IX | Correctness Over Optimization | PASS | Backend validates all mutation preconditions (board editability, node lock state, content validity) before commit. Optimistic UI is convenience only. |
| X | Explicit Budgets | PASS | Node mutation timeout (5s), hydration timeout (6s), text limit (20,000 chars), geometry limits (0 < w/h ≤ 10,000) all in config/limits. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/005-node-crud/
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── node-endpoints.md       # Phase 1 output — API endpoint contracts
└── checklists/
    └── requirements.md         # From /speckit.specify + /speckit.clarify
```

### Source Code (repository root)

```text
backend/
  src/
    config/
      limits.ts                             # MODIFIED — add node-specific limits
    http/
      router.ts                             # MODIFIED — register node routes
      controllers/
        nodes.controller.ts                 # NEW — create, update, delete handlers
      middleware/
        content-type.ts                     # EXISTING — already handles merge-patch
    schemas/
      node.schemas.ts                       # NEW — Zod schemas for create/update/delete
      board-state.schemas.ts                # EXISTING — Node type already defined
    services/
      nodes.service.ts                      # NEW — create, update, delete orchestration
    domain/
      validation/
        node-rules.ts                       # NEW — per-type content, geometry, lock, editability
      patch/
        merge-patch.ts                      # NEW — JSON merge-patch utility for JSONB fields
      operations/
        operation-factory.ts                # EXISTING — payloads already typed for node ops
    repos/
      nodes.repo.ts                         # MODIFIED — add insert, update, soft-delete
      edges.repo.ts                         # MODIFIED — add cascade soft-delete by node
    db/
      tx.ts                                 # EXISTING — withBoardMutation unchanged
  tests/
    unit/
      node-rules.unit.test.ts              # NEW
      merge-patch.unit.test.ts             # NEW
    integration/
      nodes.integration.test.ts            # NEW — transactional node CRUD + cascade
    contract/
      nodes.contract.test.ts               # NEW — HTTP endpoint contracts

frontend/
  src/
    api/
      nodes.api.ts                          # NEW — createNode, updateNode, deleteNode
    store/
      board.store.ts                        # MODIFIED — add node mutation actions, optimistic UI, reconciliation
      types.ts                              # MODIFIED — add node mutation state types
    components/
      canvas/
        Canvas.tsx                          # NEW — infinite canvas with pan, node rendering
        CanvasToolbar.tsx                   # NEW — node type selection, placement mode
        nodes/
          NodeRenderer.tsx                  # NEW — dispatch by node type
          StickyNode.tsx                    # NEW — sticky visual + inline edit
          TextNode.tsx                      # NEW — text block visual + inline edit
          ShapeNode.tsx                     # NEW — rectangle/ellipse/diamond rendering
          NodeWrapper.tsx                   # NEW — selection, drag, resize, state indicators
          InlineEditor.tsx                  # NEW — text editing with auto-save on blur
      shared/
        UndoToast.tsx                       # NEW — delete undo toast
    hooks/
      useNodeMutations.ts                   # NEW — create, update, delete with optimistic UI
      useCanvasPan.ts                       # NEW — basic pan via drag on empty area
      useNodeDrag.ts                        # NEW — drag-to-move with commit on release
      useNodeResize.ts                      # NEW — resize handles with commit on release
    pages/
      BoardPage.tsx                         # MODIFIED — integrate Canvas instead of placeholder
  tests/
    unit/
      node-mutations.unit.test.ts          # NEW
    e2e/
      node-crud.e2e.test.ts                # NEW — Playwright: create, edit, move, delete
```

**Structure Decision**: Full-stack slice following established patterns. Backend adds one controller, one service, extends existing repos, adds domain validation rules and merge-patch utility. Frontend extends the canvas placeholder from S3.5 with real node components, interaction hooks, and mutation logic. No new architectural layers introduced.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | All 3 endpoints validate and persist server-side. Frontend reconciles from response. |
| II | Revision as Sync Primitive | PASS | PASS | `withBoardMutation` handles revision bump for create, update, and delete (including cascade). |
| III | Operations-First Mutation | PASS | PASS | `buildOperation` writes `create_node`, `update_node`, `delete_node`, and cascade `delete_edge` entries in same transaction. |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows. |
| V | Atomic Batch Durability | PASS | PASS | Node delete + cascade edge soft-delete is atomic. Individual mutations are also atomic via `withBoardMutation`. |
| VI | Contract-First Implementation | PASS | PASS | Endpoints follow existing OpenAPI schemas. `contracts/node-endpoints.md` documents request/response shapes. Zod schemas match OpenAPI. |
| VII | Vertical Slice Testability | PASS | PASS | Backend: unit (node-rules, merge-patch), integration (transactional CRUD), contract (HTTP). Frontend: unit (mutations), e2e (Playwright). |
| VIII | Modular Monolith | PASS | PASS | New files follow established layering. `nodes.service.ts` orchestrates through repos + domain rules. No cross-cutting changes. |
| IX | Correctness Over Optimization | PASS | PASS | All domain validation runs before commit. Merge-patch utility is straightforward recursive merge. No caching introduced. |
| X | Explicit Budgets | PASS | PASS | Node text limit (20,000), geometry limits (0 < w/h ≤ 10,000), mutation timeout (5s) all in `config/limits.ts`. |

**Post-design gate result**: PASS — no violations.

## Complexity Tracking

No constitution violations to justify.
