# Implementation Plan: Revision + Operations Foundation

**Branch**: `003-revision-operations` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-revision-operations/spec.md`

## Summary

Harden and generalize the revision and operations infrastructure
established in S1. This slice reconciles the operation_type enum with
S3 clarifications (removing `create_board`, `delete_board`,
`archive_board`; using `update_board` for all board-level state
changes), introduces per-board write serialization via advisory locks,
creates a reusable `withBoardMutation` transaction wrapper that
enforces the revision-bump and operation-logging invariants, and
generalizes the operation factory into a single `buildOperation`
function with typed payload interfaces for all current and future
operation types. No new API endpoints are introduced — this is a
refactoring and infrastructure hardening slice that prepares the
mutation foundation for S4 (nodes), S5 (edges), and S6 (batch
mutations).

## Technical Context

**Language/Version**: TypeScript (Node.js LTS)
**Primary Dependencies**: Express (HTTP), Zod (schema validation),
node-postgres (pg) for database access
**Storage**: PostgreSQL 15+
**Testing**: Vitest (unit + integration), Supertest (HTTP contract)
**Target Platform**: Linux server / container, local dev via Docker
Compose
**Project Type**: Web service (REST API — modular monolith)
**Performance Goals**: p50 < 250ms mutations, p50 < 150ms reads
(per NFR doc)
**Constraints**: 5s hard timeout mutations; advisory lock overhead
< 5ms per transaction
**Scale/Scope**: Single user MVP; up to ~100 boards

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1
design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | All mutations go through backend; no behavior change to external API |
| II | Revision as Sync Primitive | PASS | Revision policy unchanged. Per-board advisory lock guarantees monotonic ordering (FR-016, FR-023) |
| III | Operations-First Mutation | PASS | `withBoardMutation` enforces operation logging in same transaction for every durable mutation. Board creation exempted per clarification (genesis event) |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice |
| V | Atomic Batch Durability | PASS | `withBoardMutation` guarantees all-or-nothing: operations + revision bump commit or roll back together |
| VI | Contract-First Implementation | PASS | No new API surface. Internal contract defined in `contracts/mutation-infrastructure.md`. Migration aligns DB schema with canonical data model |
| VII | Vertical Slice Testability | PASS | 5 user stories from spec are independently testable. New unit/integration tests verify all invariants |
| VIII | Modular Monolith | PASS | Infrastructure lives in `db/tx.ts` (advisory lock, mutation wrapper) and `domain/operations/` (factory). No architectural change |
| IX | Correctness Over Optimization | PASS | Advisory lock adds < 5ms per transaction. Correctness of serialization prioritized over throughput |
| X | Explicit Budgets | PASS | No new timeouts or limits. Existing budgets in config unchanged |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-revision-operations/
├── plan.md                               # This file
├── research.md                           # Phase 0 output
├── data-model.md                         # Phase 1 output
├── quickstart.md                         # Phase 1 output
├── contracts/
│   └── mutation-infrastructure.md        # Phase 1 output — internal service contracts
└── checklists/
    └── requirements.md                   # From /speckit.specify
```

### Source Code (repository root)

```text
backend/
  src/
    db/
      tx.ts                              # MODIFIED — add acquireBoardLock, withBoardMutation
      migrations/
        007_narrow_operation_type.sql     # NEW — update CHECK constraint
    domain/
      operations/
        operation-factory.ts              # MODIFIED — generalize to buildOperation + typed payloads
    services/
      boards.service.ts                   # MODIFIED — use withBoardMutation, remove create op
  tests/
    unit/
      operation-factory.unit.test.ts      # NEW — test generalized factory
      board-mutation.unit.test.ts         # NEW — test withBoardMutation behavior
      revision-policy.unit.test.ts        # EXISTING — verify unchanged behavior
    integration/
      revision-operations.integration.test.ts  # NEW — transactional invariants
    contract/
      boards.contract.test.ts             # EXISTING — verify HTTP behavior unchanged
```

**Structure Decision**: No new modules or layers. Changes are
confined to existing infrastructure files (`tx.ts`,
`operation-factory.ts`, `boards.service.ts`) and one new migration.
This reinforces the modular monolith by centralizing mutation
orchestration in the transaction layer rather than scattering it
across service methods.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | No external behavior change |
| II | Revision as Sync Primitive | PASS | PASS | Advisory lock serializes per-board; `withBoardMutation` enforces single revision bump per batch |
| III | Operations-First Mutation | PASS | PASS | `withBoardMutation` makes operation logging mandatory. Board creation exempted per clarification (not a mutation of existing state) |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows |
| V | Atomic Batch Durability | PASS | PASS | `withBoardMutation` wraps all entity writes + operation inserts + revision bump in one transaction |
| VI | Contract-First Implementation | PASS | PASS | Migration 007 aligns DB enum with canonical data model. `mutation-infrastructure.md` defines internal contracts |
| VII | Vertical Slice Testability | PASS | PASS | New test files verify all invariants independently. Existing contract tests verify no external regression |
| VIII | Modular Monolith | PASS | PASS | `withBoardMutation` lives in `db/tx.ts`; `buildOperation` in `domain/operations/`. Clean layering preserved |
| IX | Correctness Over Optimization | PASS | PASS | Advisory lock prioritizes correctness. No caching introduced |
| X | Explicit Budgets | PASS | PASS | No new timeouts or limits |

**Post-design gate result**: PASS — no violations. The operation_type
enum reconciliation (R-001 from research.md) is resolved by migration
007.

## Complexity Tracking

No constitution violations to justify.
