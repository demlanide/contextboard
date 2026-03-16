# Implementation Plan: Board State Hydration

**Branch**: `002-board-state-hydration` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-board-state-hydration/spec.md`

## Summary

Deliver the primary board hydration endpoint `GET /boards/{boardId}/state`
that returns the full active board state in a single request. The response
includes board metadata, non-deleted nodes, non-deleted edges, chat thread
metadata, and the board's current revision as `lastOperationRevision`.
This endpoint is read-only — it never mutates state, increments revision,
or writes operation log entries. This slice maps to roadmap slice S2 and
depends on S1 (Board Foundation) being complete.

## Technical Context

**Language/Version**: TypeScript (Node.js LTS)
**Primary Dependencies**: Express (HTTP), Zod (schema validation),
node-postgres (pg) for database access
**Storage**: PostgreSQL 15+
**Testing**: Vitest (unit + integration), Supertest (HTTP contract)
**Target Platform**: Linux server / container, local dev via Docker Compose
**Project Type**: Web service (REST API — modular monolith)
**Performance Goals**: p50 < 400ms, p95 < 1200ms for board hydration
(per NFR doc and constitution)
**Constraints**: 6s hard timeout for hydration; all budgets explicit in
config
**Scale/Scope**: Single user MVP; boards with up to 5,000 nodes (soft
limit), target performance at 500 nodes / 1,000 edges

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | Hydration returns server-authoritative state; frontend replaces local store from this response |
| II | Revision as Sync Primitive | PASS | FR-007: `lastOperationRevision` equals board's current revision; frontend uses this as sync baseline |
| III | Operations-First Mutation | N/A | Read-only endpoint; no mutations, no operations written |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice |
| V | Atomic Batch Durability | N/A | No mutations in this slice |
| VI | Contract-First Implementation | PASS | OpenAPI spec defines `GetBoardStateResponse` with required fields; contracts/ artifact generated before implementation |
| VII | Vertical Slice Testability | PASS | 5 independently testable user stories with acceptance scenarios; traceable to test matrix T007 |
| VIII | Modular Monolith | PASS | Adds board-state.controller.ts + board-state.service.ts following established layering |
| IX | Correctness Over Optimization | PASS | Full-state hydration for MVP; no caching; correct soft-delete filtering prioritized over query optimization |
| X | Explicit Budgets | PASS | Hydration hard timeout (6s), statement timeout (5s), p50/p95 targets all from config |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-board-state-hydration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── board-state-api.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
backend/
  src/
    http/
      controllers/
        board-state.controller.ts     # NEW — route handler for GET /boards/:boardId/state
    schemas/
      board-state.schemas.ts          # NEW — Zod schema for state response
    services/
      board-state.service.ts          # NEW — hydration orchestration
    repos/
      boards.repo.ts                  # EXISTING — add findActiveById method if needed
      nodes.repo.ts                   # NEW — findActiveByBoardId query
      edges.repo.ts                   # NEW — findActiveByBoardId query
      chat-threads.repo.ts            # EXISTING — add findByBoardId method if needed
    db/
      migrations/
        005_create_board_nodes.sql    # NEW — table creation (read-side prerequisite)
        006_create_board_edges.sql    # NEW — table creation (read-side prerequisite)
  tests/
    contract/
      board-state.contract.test.ts    # NEW — HTTP contract tests for state endpoint
    integration/
      board-state.integration.test.ts # NEW — DB-backed hydration tests
    unit/
      board-state.unit.test.ts        # NEW — service-level unit tests
```

**Structure Decision**: Follows the modular monolith layout from S1.
This slice adds the board-state vertical (controller, service,
response schema) and introduces the board_nodes and board_edges table
migrations as read-side prerequisites. The CRUD services for nodes and
edges are not part of this slice — only the repository read methods
needed for hydration.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | Hydration is the canonical initial-load endpoint; frontend replaces confirmed state entirely |
| II | Revision as Sync Primitive | PASS | PASS | `lastOperationRevision` sourced directly from `boards.revision` column; no computation or derivation |
| III | Operations-First Mutation | N/A | N/A | No mutations in this slice |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows |
| V | Atomic Batch Durability | N/A | N/A | No mutations |
| VI | Contract-First Implementation | PASS | PASS | R-001 resolved: OpenAPI `GetBoardStateResponse` already defines correct shape. Contract artifact `board-state-api.md` aligns with spec |
| VII | Vertical Slice Testability | PASS | PASS | 5 user stories → test matrix T007 coverage. Contract, integration, unit test structure defined |
| VIII | Modular Monolith | PASS | PASS | board-state.controller → board-state.service → repos layering; no cross-service mutation calls |
| IX | Correctness Over Optimization | PASS | PASS | Three separate indexed queries (board, nodes, edges) + thread lookup; no JOINs, no caching |
| X | Explicit Budgets | PASS | PASS | Hydration statement timeout (5s) and hard request timeout (6s) in config |

**Post-design gate result**: PASS — no violations. The node/edge table
migrations (R-002 from research.md) are a prerequisite resolved by
creating the tables in this slice.

## Complexity Tracking

No constitution violations to justify.
