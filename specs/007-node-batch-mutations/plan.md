# Implementation Plan: Node Batch Mutations

**Branch**: `007-node-batch-mutations` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/007-node-batch-mutations/spec.md`

## Summary

Add atomic batch node mutations via `POST /boards/{boardId}/nodes/batch`. Backend introduces a `batch.service.ts` that processes an ordered array of create/update/delete node operations inside a single `withBoardMutation` transaction, resolves client temp IDs to server-assigned UUIDs, cascade-deletes connected edges on node removal, writes per-item operation log entries under one shared revision and batch ID, and returns a full diff (created/updated/deleted with entity type tags) for frontend reconciliation. Frontend adds a `useBatchNodeMutations` hook and batch-aware store actions so grouped canvas interactions (multi-select move, multi-delete, paste-many) submit one network request and reconcile from the server-returned diff on success or roll back all affected nodes on failure.

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS for backend, browser for frontend)
**Primary Dependencies**: Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend
**Storage**: PostgreSQL 15+ (backend source of truth); Zustand normalized store (frontend confirmed state)
**Testing**: Vitest + Supertest (backend unit/integration/contract); Vitest + React Testing Library (frontend unit); Playwright (frontend e2e)
**Target Platform**: Linux server/container (backend), modern desktop browsers (frontend)
**Project Type**: Full-stack web application (modular monolith backend + SPA frontend)
**Performance Goals**: p50 < 400ms for 200-op batch; p95 < 2s; p50 < 250ms for typical 5-10 op batch
**Constraints**: 5s hard timeout mutations; max 200 operations per batch; min 1 operation per batch; single-user MVP; no auth; all limits in config
**Scale/Scope**: Single user; up to 200 ops per batch; 1 new API endpoint; ~8 new/modified backend files; ~6 new/modified frontend files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | Batch endpoint validates all operations server-side. FR-019: frontend reconciles from server-returned batch diff, not local inference. |
| II | Revision as Sync Primitive | PASS | FR-004: board revision increments exactly once per successful batch. FR-021: frontend updates revision from response. Failed batches do not advance revision. |
| III | Operations-First Mutation | PASS | FR-005: every durable change in the batch writes an operation log entry, all sharing the same board revision and batch ID, within the same transaction. |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice. Agent-apply will reuse batch mutation helpers in S10 but is out of scope here. |
| V | Atomic Batch Durability | PASS | FR-003: entire batch is all-or-nothing. FR-008: any single operation failure rejects the entire batch. No partial state, revision, or operations on failure. |
| VI | Contract-First Implementation | PASS | `contracts/batch-endpoint.md` defines request/response shapes. Zod batch schemas will match OpenAPI. Existing test-matrix cases T024–T027 cover batch behavior. |
| VII | Vertical Slice Testability | PASS | Slice includes batch API endpoint, validation, persistence, revision/ops, frontend batch mutations, reconciliation, rollback, and tests at all layers. |
| VIII | Modular Monolith | PASS | Backend adds `batch.service.ts` orchestrating through existing node repos + domain rules. Reuses `withBoardMutation`, `buildOperation`, node-rules, merge-patch. New controller route, schema, and service follow established layering. |
| IX | Correctness Over Optimization | PASS | All operations validated in order within the transaction. Temp IDs resolved before dependent operations. Domain validation (lock, editability, existence, content rules) applied per-item. |
| X | Explicit Budgets | PASS | Max 200 ops in config/limits. 5s hard mutation timeout. Batch-specific structured logging (boardId, batchId, opCount, opTypes). |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-node-batch-mutations/
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── batch-endpoint.md       # Phase 1 output — API endpoint contract
└── checklists/
    └── requirements.md         # From /speckit.specify + /speckit.clarify
```

### Source Code (repository root)

```text
backend/
  src/
    config/
      limits.ts                             # MODIFIED — add BATCH_MAX_OPERATIONS, BATCH_MIN_OPERATIONS
    http/
      router.ts                             # MODIFIED — register POST /boards/:boardId/nodes/batch
      controllers/
        nodes.controller.ts                 # MODIFIED — add batchNodeMutations handler
      middleware/
        idempotency.ts                      # EXISTING — batch endpoint uses existing idempotency middleware
        content-type.ts                     # EXISTING — batch uses application/json
    schemas/
      batch.schemas.ts                      # NEW — Zod schemas for batch request/response
      node.schemas.ts                       # EXISTING — CreateNodeRequest, UpdateNodeRequest reused
    services/
      batch.service.ts                      # NEW — batch orchestration: ordered execution, temp-ID map, cascade
      nodes.service.ts                      # MODIFIED — extract in-transaction helpers for reuse by batch
    domain/
      validation/
        node-rules.ts                       # EXISTING — reused per-item within batch
        batch-rules.ts                      # NEW — batch-level validation (size limits, duplicate tempIds, ordering)
      ids/
        temp-id-map.ts                      # NEW — temp-ID registry: register, resolve, validate uniqueness
      operations/
        operation-factory.ts                # EXISTING — buildOperation with batchId already supported
      patch/
        merge-patch.ts                      # EXISTING — reused for batch update operations
    repos/
      nodes.repo.ts                         # EXISTING — insertNode, updateNode, softDeleteNode reused
      edges.repo.ts                         # EXISTING — softDeleteByNodeId for cascade reuse
    db/
      tx.ts                                 # EXISTING — withBoardMutation handles lock + revision + ops
  tests/
    unit/
      batch-rules.unit.test.ts             # NEW — batch validation unit tests
      temp-id-map.unit.test.ts             # NEW — temp-ID resolution unit tests
    integration/
      batch.integration.test.ts            # NEW — atomic batch CRUD, cascade, temp IDs, rollback
    contract/
      batch.contract.test.ts               # NEW — HTTP endpoint contract tests

frontend/
  src/
    api/
      nodes.api.ts                          # MODIFIED — add batchNodeMutations API function
    store/
      board.store.ts                        # MODIFIED — add batch mutation actions (optimistic, reconcile, rollback)
      types.ts                              # MODIFIED — add BatchMutationState type
    hooks/
      useBatchNodeMutations.ts              # NEW — batch move, batch delete, batch create with pending/rollback
      useNodeDrag.ts                        # MODIFIED — multi-select drag commits via batch endpoint
      useNodeMutations.ts                   # EXISTING — single-node mutations unchanged
    components/
      canvas/
        Canvas.tsx                          # MODIFIED — multi-select group-drag uses batch endpoint
  tests/
    unit/
      batch-mutations.unit.test.ts         # NEW — batch store actions and API integration
```

**Structure Decision**: Full-stack slice extending established patterns. Backend adds batch orchestration as a new service that reuses existing node repos, domain rules, and the `withBoardMutation` transaction wrapper. In-transaction node mutation helpers are extracted from `nodes.service.ts` so both single-node and batch flows share the same validated mutation path. Frontend adds a batch-aware hook and store actions alongside existing single-node mutation infrastructure.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | `batch.service.ts` validates and persists server-side. Frontend reconciles from response diff (FR-019). |
| II | Revision as Sync Primitive | PASS | PASS | `withBoardMutation` bumps revision once for entire batch. Frontend updates revision from `boardRevision` in response. |
| III | Operations-First Mutation | PASS | PASS | Each item in batch generates an operation entry via `buildOperation` with shared `batchId` and `boardRevision`. All written in same transaction. |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows. |
| V | Atomic Batch Durability | PASS | PASS | `withBoardMutation` wraps entire batch in single transaction. `ROLLBACK` on any failure. No partial state. |
| VI | Contract-First Implementation | PASS | PASS | `contracts/batch-endpoint.md` documents full request/response shapes. `batch.schemas.ts` matches. Test cases T024–T027 from test-matrix apply. |
| VII | Vertical Slice Testability | PASS | PASS | Unit (batch-rules, temp-id-map), integration (transactional batch), contract (HTTP), frontend unit (store actions), e2e (multi-select batch). |
| VIII | Modular Monolith | PASS | PASS | `batch.service.ts` orchestrates via repos + domain rules. Reuses existing mutation helpers from `nodes.service.ts` — no second mutation path. |
| IX | Correctness Over Optimization | PASS | PASS | Per-item validation within transaction. Temp IDs validated for uniqueness and forward references. Lock, editability, existence checked per-item. |
| X | Explicit Budgets | PASS | PASS | `BATCH_MAX_OPERATIONS` and `BATCH_MIN_OPERATIONS` in `config/limits.ts`. 5s hard timeout. Structured logging emits batchId, opCount, opTypes. |

**Post-design gate result**: PASS — no violations.

## Complexity Tracking

No constitution violations to justify.
