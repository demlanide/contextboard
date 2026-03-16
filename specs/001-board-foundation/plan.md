# Implementation Plan: Board Foundation

**Branch**: `001-board-foundation` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-board-foundation/spec.md`

## Summary

Deliver the first usable board lifecycle for the Context Board MVP:
create, list, read, update (merge-patch), soft-delete, and archive
with enforced status transitions. Board creation auto-provisions a
one-to-one chat thread. Every durable mutation writes to the operations
log. Board revision is the sync primitive and increments exactly once
per committed mutation batch. This slice maps to roadmap slice S1 and
is the prerequisite for all subsequent feature slices.

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
**Constraints**: 2s hard timeout reads, 5s hard timeout mutations;
all budgets explicit in config
**Scale/Scope**: Single user MVP; up to ~100 boards

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1
design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | All reads and mutations go through backend; frontend reconciles from server response |
| II | Revision as Sync Primitive | PASS | FR-016: metadata update increments revision once; FR-017: delete writes op log without revision bump; FR-014b: archive increments revision |
| III | Operations-First Mutation | PASS | FR-016, FR-017: every durable change (update, delete, archive) writes operation log entry in same transaction |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice |
| V | Atomic Batch Durability | N/A | No batch mutations in this slice; single-entity transactions are inherently atomic |
| VI | Contract-First Implementation | PASS | OpenAPI spec defines all board endpoints; this plan generates contracts/ artifacts before implementation |
| VII | Vertical Slice Testability | PASS | Spec defines 6 independently testable user stories with acceptance scenarios traceable to test matrix T001–T006 |
| VIII | Modular Monolith | PASS | Architecture follows controller → service → repo layering within one deployable |
| IX | Correctness Over Optimization | PASS | Validation thoroughness prioritized; no caching in this slice |
| X | Explicit Budgets | PASS | Timeout budgets, rate limits, and validation limits reference config, not hardcoded values |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-board-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── boards-api.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
backend/
  src/
    main/
      app.ts
      bootstrap.ts
    config/
      env.ts
      limits.ts
    http/
      router.ts
      middleware/
        request-id.ts
        error-handler.ts
        idempotency.ts
        content-type.ts
      controllers/
        boards.controller.ts
    schemas/
      board.schemas.ts
      common.schemas.ts
    services/
      boards.service.ts
    domain/
      validation/
        board-rules.ts
      revision/
        revision-policy.ts
      operations/
        operation-factory.ts
    repos/
      boards.repo.ts
      chat-threads.repo.ts
      operations.repo.ts
      idempotency.repo.ts
    db/
      pool.ts
      tx.ts
      migrations/
        001_create_boards.sql
        002_create_chat_threads.sql
        003_create_board_operations.sql
        004_create_idempotency_keys.sql
    obs/
      logger.ts
      metrics.ts
  tests/
    contract/
      boards.contract.test.ts
    integration/
      boards.integration.test.ts
    unit/
      board-rules.unit.test.ts
      revision-policy.unit.test.ts
```

**Structure Decision**: Follows the modular monolith layout from
`documentation/architecture.md`. This slice introduces the foundational
layers (HTTP, service, repo, domain, config, observability) that all
future slices will build on.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | All mutations server-validated; frontend reconciles from response |
| II | Revision as Sync Primitive | PASS | PASS | Revision policy defined in data-model.md: create=0, update=+1, archive=+1, delete=no-bump |
| III | Operations-First Mutation | PASS | PASS | R-001 resolved: added create_board, delete_board, archive_board to OperationType. Payload shapes defined |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows |
| V | Atomic Batch Durability | N/A | N/A | No batch mutations |
| VI | Contract-First Implementation | PASS | PASS | R-002 (ChatThread schema) and R-003 (status in UpdateBoardRequest) identified as pre-implementation contract fixes. boards-api.md fully defined |
| VII | Vertical Slice Testability | PASS | PASS | 6 user stories → 6 test matrix refs (T001–T006). Contract, integration, unit test structure defined |
| VIII | Modular Monolith | PASS | PASS | Project structure follows controller→service→repo→domain layering |
| IX | Correctness Over Optimization | PASS | PASS | No caching, no shortcuts. Validation-first design |
| X | Explicit Budgets | PASS | PASS | Timeout budgets, pool limits, statement timeouts all in env config |

**Post-design gate result**: PASS — no violations. Two pre-implementation
schema fixes required (R-002, R-003) before coding begins.

## Complexity Tracking

No constitution violations to justify.
