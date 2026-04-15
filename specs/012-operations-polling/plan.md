# Implementation Plan: Operations Polling for Board Revisions

**Branch**: `012-operations-polling` | **Date**: 2026-04-14 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/012-operations-polling/spec.md`

## Summary

Expose `GET /boards/{boardId}/operations?afterRevision=&limit=` as a read-only polling endpoint backed by the existing `board_operations` table (introduced in S3). Add a client sync layer that periodically calls this endpoint using the last confirmed revision as a cursor, applies returned operations in sequence to the confirmed store, and falls back to a full board-state rehydrate when stale-cursor detection triggers.

No new durable tables or write paths are introduced. The backend change is one new read controller and extensions to the existing operations service and repository. The frontend adds one new polling service module and extends the board Zustand store with cursor tracking, polling lifecycle, and stale-state handling.

---

## Technical Context

**Language/Version**: TypeScript 5.7+ (Node.js LTS for backend, browser for frontend)  
**Primary Dependencies**: Express (HTTP routing), Zod (request validation), node-postgres (`pg`) for backend; React 19, Zustand, React Router 7, Vite for frontend  
**Storage**: PostgreSQL 15+ — reads from existing `board_operations` and `boards` tables; no new tables or migrations required  
**Testing**: Existing integration test harness (`npm test`); contract validation against OpenAPI spec  
**Target Platform**: Linux server (backend), modern browser (frontend)  
**Project Type**: Web service — modular monolith backend + React SPA frontend  
**Performance Goals**: Operations polling reads fall in the "Fast reads" budget class — p50 ≤ 150ms, p95 ≤ 400ms  
**Constraints**: Hard timeout 2s (fast reads class); max page size 100 ops/request for MVP (lives in `config/limits.ts`); rate limit 120 req/min (reads class)  
**Scale/Scope**: Single-user MVP; boards up to 5,000 nodes and 10,000 operations; polling interval expected 10–30s on an active tab

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Backend Source of Truth | ✅ Pass | Read-only endpoint; client applies returned ops into confirmed store; server response is the only authoritative source |
| II. Revision as Sync Primitive | ✅ Pass | `afterRevision` IS the integer revision cursor; client advances cursor from the `boardRevision` of the last received operation |
| III. Operations-First Mutation Model | ✅ Pass | This feature only reads the existing `board_operations` log; introduces no new mutation paths |
| IV. Suggest/Apply Separation | ✅ Pass | Not applicable — endpoint is read-only; polling cannot trigger a suggest or apply flow |
| V. Atomic Batch Durability | ✅ Pass | Not applicable — no writes or transactions involved |
| VI. Contract-First Implementation | ⚠️ Gap | OpenAPI path exists but is missing: (a) 410 stale-cursor response, (b) `headRevision` field in response body, (c) explicit documentation of omitted-`afterRevision` behavior. Must be resolved in contracts before implementation. |
| VII. Vertical Slice Testability | ✅ Pass | Depends only on the `board_operations` table from S3; fully testable with seeded operations data |
| VIII. Modular Monolith Architecture | ✅ Pass | Uses existing `operations.controller.ts`, `operations.service.ts`, `operations.repo.ts` module paths from architecture |
| IX. Correctness Over Optimization | ✅ Pass | Simple ordered read; the only correctness risk is revision ordering semantics, which is enforced at the SQL level |
| X. Explicit Budgets and Observability | ⚠️ Gap | Max page size and hard timeout must live in `config/limits.ts`, not as inline literals; polling-specific log events and a rate-limit entry for the reads class must be confirmed |

**Post-Phase-1 re-evaluation**: Gaps in VI and X are addressed in the contracts and quickstart artifacts below. No constitution violations remain.

---

## Project Structure

### Documentation (this feature)

```text
specs/012-operations-polling/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── operations-polling.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (files touched by this feature)

```text
backend/
  src/
    config/
      limits.ts                            # EXTEND: POLLING_MAX_PAGE_SIZE, POLLING_HARD_TIMEOUT_MS

    http/
      router.ts                            # VERIFY: /boards/:boardId/operations route registered
      controllers/
        operations.controller.ts           # ADD: GET /boards/:boardId/operations handler

    schemas/
      operations.schemas.ts                # ADD: Zod schema for query params + response envelope

    services/
      operations.service.ts                # EXTEND: getOperationsAfterRevision() read method

    repos/
      operations.repo.ts                   # EXTEND: paginated read query by afterRevision

  documentation/
    openapi.yaml                           # EXTEND: 410 stale-cursor response, headRevision field

frontend/
  src/
    services/
      operations-poller.ts                 # ADD: polling loop, cursor management, stale detection

    stores/
      board-store.ts                       # EXTEND: polling cursor, stale flag, poll start/stop

    components/
      SyncIndicator/                       # ADD (P4): lightweight stale/syncing indicator
        SyncIndicator.tsx
```

**Structure Decision**: Web application (backend + frontend). Matches existing project layout. The feature adds one backend controller, extends two existing service/repo files, adds one frontend service module, and extends the board store. No new top-level directories needed.

---

## Complexity Tracking

No constitution violations requiring justification. All changes are additive read-path extensions within the existing modular monolith architecture.
