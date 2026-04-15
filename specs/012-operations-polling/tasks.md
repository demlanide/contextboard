# Tasks: Operations Polling for Board Revisions

**Branch**: `012-operations-polling`  
**Input**: Design documents from `/specs/012-operations-polling/`  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contracts**: [contracts/operations-polling.md](contracts/operations-polling.md)

**Format**: `- [ ] T0XX [P?] [US?] Description with file path`  
- **[P]** = parallelizable (no dependency on an incomplete task in the same phase)  
- **[US#]** = maps to user story from spec.md

---

## Phase 1: Setup (Contract + Config)

**Purpose**: Satisfy the two constitution gates (Contract-First + Explicit Budgets) before any implementation begins. These tasks have no code dependencies and can be done first.

- [x] T001 Update `documentation/openapi.yaml` — add `'410'` response (`CURSOR_INVALID`) to `getBoardOperations`, add `headRevision: integer` (required) to `GetOperationsResponse.data`, add `default: 0` and description to `afterRevision` parameter (see contracts/operations-polling.md §OpenAPI Changes Required)
- [x] T002 [P] Extend `backend/src/config/limits.ts` — add `POLLING_MAX_PAGE_SIZE` (default `100`), `POLLING_HARD_TIMEOUT_MS` (default `2000`), `POLLING_MIN_SAFE_REVISION` (default `0`) from env vars; no hardcoded literals in feature code

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend schema validation layer and DB index must exist before service/controller work. Depends on Phase 1.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [x] T003 [P] Create `backend/src/schemas/operations.schemas.ts` — add `GetOperationsQuerySchema` (Zod: `afterRevision` coerced int ≥ 0 default 0, `limit` coerced int 1–500 default 100), `OperationResponseSchema` (all fields from `Operation` OpenAPI schema), `GetOperationsResponseSchema` (operations array, nextCursor nullable string, headRevision int)
- [x] T004 [P] Add migration file in `backend/src/db/migrations/` — `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_board_operations_board_id_board_revision ON board_operations (board_id, board_revision)` — confirm index does not already exist before adding; mark migration idempotent with `IF NOT EXISTS`

**Checkpoint**: Schemas and DB index ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Incremental Board Refresh After Inactivity (Priority: P1) 🎯 MVP

**Goal**: A client with a known confirmed revision can call `GET /boards/{boardId}/operations?afterRevision=R` and receive all committed operations after revision R in deterministic order, apply them to the confirmed store, and advance its cursor — keeping the board view in sync without a full page reload.

**Independent Test**: Seed a board at revision R. Commit mutations to advance it to R+N. Poll with `afterRevision=R`. Verify: (1) exactly N operations returned, ordered by `boardRevision` ASC; (2) `headRevision` equals R+N; (3) `nextCursor` equals string(last op's boardRevision); (4) applying all returned ops to a fresh confirmed-state snapshot produces the same state as `GET /boards/{boardId}/state` at revision R+N.

### Backend — US1

- [x] T005 [P] [US1] Extend `backend/src/repos/operations.repo.ts` — add `getAfterRevision(boardId: string, afterRevision: number, limit: number, tx?: PoolClient): Promise<{ operations: OperationRow[]; headRevision: number }>`: validate board exists and is not deleted (throw `BoardNotFoundError` if not), SELECT from `board_operations WHERE board_id = $1 AND board_revision > $2 ORDER BY board_revision ASC, id ASC LIMIT $3`, return operations rows + board's current `revision` as `headRevision`
- [x] T006 [P] [US1] Extend `backend/src/services/operations.service.ts` — add `getOperationsAfterRevision(boardId: string, afterRevision: number, requestedLimit: number)`: clamp limit to `Math.min(requestedLimit, POLLING_MAX_PAGE_SIZE)`, check `afterRevision < POLLING_MIN_SAFE_REVISION` → throw `CursorInvalidError(minSafeRevision)`, call `operationsRepo.getAfterRevision()`, compute `nextCursor` as `String(operations.at(-1)!.boardRevision)` or `null`, return `{ operations, nextCursor, headRevision }`
- [x] T007 [US1] Create `backend/src/http/controllers/operations.controller.ts` — add `GET /boards/:boardId/operations` route handler: parse `boardId` from params, validate query with `GetOperationsQuerySchema.safeParse()` → 400 on failure, call `operationsService.getOperationsAfterRevision()`, return 200 `{ data: result, error: null }`, catch `BoardNotFoundError` → 404, catch `CursorInvalidError` → 410 with `CURSOR_INVALID` code and `minSafeRevision` in details; emit structured log events: debug on request received (boardId, afterRevision, limit, requestId), info on success (count, headRevision, durationMs), warn on 410, info on 404, error on unexpected (depends on T003, T005, T006)
- [x] T008 [US1] Verify `GET /boards/:boardId/operations` route is registered in `backend/src/http/router.ts` under the boards route group; if missing, add it wired to `operations.controller.ts` handler (depends on T007)

### Frontend — US1

- [x] T009 [P] [US1] Extend `frontend/src/stores/board-store.ts` — add `pollingCursor: number | null`, `pollingStatus: 'idle' | 'polling' | 'error'` to the `sync` slice; add actions `setPollingCursor(revision: number)`, `setPollingStatus(status)`, `markStale()` (sets `stale = true`), `clearStale()` (sets `stale = false`); update the hydration success handler to set `sync.pollingCursor = board.revision` immediately after hydration completes
- [x] T010 [P] [US1] Create `frontend/src/api/operations.api.ts` — `fetchBoardOperations(boardId, afterRevision, limit?)` with raw fetch for 410 detection; returns `{ data, status, error }`
- [x] T011 [US1] Implement operation application logic in `frontend/src/store/board.store.ts` — `applyPolledOperation(op)` dispatch for create/update/delete node and edge; best-effort reconstruction; unknown type → advance revision (implemented as part of T009)
- [x] T012 [US1] Implement full poll() in `frontend/src/hooks/useOperationsPoller.ts` — visibility-aware interval, in-flight mutation pause, 410 → rehydrate, gap detection, drain mode, retry counter
- [x] T013 [US1] Wire `useOperationsPoller` to board mount/unmount in `frontend/src/pages/BoardPage.tsx` (depends on T009, T012)

**Checkpoint**: End-to-end incremental polling works — open board, commit mutations in a second session, verify board updates via polling without manual reload.

---

## Phase 4: User Story 2 — Paginated Incremental Fetch (Priority: P2)

**Goal**: A client facing a large backlog of operations after its cursor can drain all operations via chained polling calls — each using `nextCursor` as the next `afterRevision` — and the final confirmed state is identical to a fresh hydration at the same revision.

**Independent Test**: Seed a board with 250 operations after revision R. Issue repeated polls with `limit=100`. Verify: first call returns 100 ops and non-null `nextCursor`; second call returns 100 more; third returns 50 and `nextCursor = null`. Applying all three pages in order produces confirmed state equal to `GET /boards/{boardId}/state` at the final revision.

- [x] T014 [US2] Drain mode in `poll()` — if `nextCursor` is non-null immediately re-poll; max 10 drain pages cap (implemented in T012/useOperationsPoller.ts)

**Checkpoint**: Client correctly pages through a large operation backlog before resuming normal interval polling.

---

## Phase 5: User Story 3 — Stale-State Detection and Rehydrate Fallback (Priority: P3)

**Goal**: When a client's cursor is invalid (410 from server) or a gap is detected locally (headRevision > cursor but operations empty), the client automatically marks state as stale and performs a full board-state rehydrate, then resumes polling from the new confirmed revision.

**Independent Test**: (a) Configure `POLLING_MIN_SAFE_REVISION` above the client's cursor value and poll — verify 410 triggers a rehydrate and polling resumes from the new revision. (b) Simulate a 200 response where `headRevision > afterRevision` and `operations` is empty — verify `markStale()` is called and rehydrate fires.

- [x] T015 [US3] 410 stale cursor handler in `poll()` — markStale + rehydrate via hydrateBoardState (implemented in useOperationsPoller.ts)
- [x] T016 [US3] headRevision gap detection in `poll()` — empty ops + headRevision > cursor → markStale + rehydrate (implemented in useOperationsPoller.ts)
- [x] T017 [US3] Verify hydrate() in board.store.ts sets pollingCursor = board.revision and stale = false on success — confirmed implemented

**Checkpoint**: Client correctly escapes stale state in both the server-signaled (410) and locally-detected (headRevision gap) scenarios.

---

## Phase 6: User Story 4 — Sync-State Visibility (Priority: P4)

**Goal**: When the client is actively syncing or has detected stale state, a non-intrusive indicator appears in the board UI. It clears automatically after a successful sync or rehydrate.

**Independent Test**: Trigger a stale state. Verify the indicator appears. Complete a rehydrate. Verify the indicator clears without user action.

- [x] T018 [P] [US4] Create `frontend/src/components/SyncIndicator/SyncIndicator.tsx` — polling/stale/error states with Refresh button
- [x] T019 [US4] Mount `<SyncIndicator />` in `frontend/src/components/layout/BoardHeader.tsx` (depends on T018)

**Checkpoint**: Stale/syncing state is visible to the user without disrupting the board canvas.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation sync (constitution gate) and validation against the quickstart test checklist.

- [x] T020 [P] Update `documentation/api.md` — expanded Operations API section with all query parameters, full 200/200-empty/400/404/410 examples, headRevision semantics, nextCursor chaining, polling behavior
- [x] T021 Run the testing checklist in `specs/012-operations-polling/quickstart.md` — tsc passes clean on both backend and frontend; pre-existing test failures (FK constraint on board_operations in integration suite) are unrelated to S12; net test regression: none (failures decreased from 114 to 111)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)         → no dependencies; start immediately
Phase 2 (Foundational)  → depends on Phase 1; BLOCKS Phase 3+
Phase 3 (US1)           → depends on Phase 2; core MVP
Phase 4 (US2)           → depends on Phase 3 (extends poll() from T012)
Phase 5 (US3)           → depends on Phase 3 (extends poll() from T012); can overlap with Phase 4
Phase 6 (US4)           → depends on Phase 3 (reads sync slice from T009)
Phase 7 (Polish)        → depends on all story phases being complete
```

### User Story Dependencies

| Story | Depends on | Notes |
|-------|-----------|-------|
| US1 (P1) | Phase 2 complete | Core backend + frontend; all other stories build on this |
| US2 (P2) | US1 complete (T012) | Extends poll() drain logic; independently testable with large operation seed |
| US3 (P3) | US1 complete (T012) | Extends poll() error handling; can be worked in parallel with US2 |
| US4 (P4) | US1 store slice (T009) | Read-only from store; independently testable with mocked store state |

### Within Each Phase — Execution Order

```
Phase 3 (US1):
  T005 + T006 + T009 + T010  →  T007  →  T008  (backend, sequential after repo/service)
  T009 + T010                →  T011  →  T012  →  T013  (frontend, sequential)
  T005/T006 parallel with T009/T010  (backend and frontend are independent files)
```

### Parallel Opportunities

**Phase 1**: T001 and T002 run in parallel (different files).  
**Phase 2**: T003 and T004 run in parallel (DB migration vs. schema file).  
**Phase 3**: Backend stream (T005→T006→T007→T008) and frontend stream (T009→T010→T011→T012→T013) run fully in parallel until T013 requires integration.  
**Phase 4 + Phase 5**: Can be worked in parallel by two developers — both extend `operations-poller.ts` but in different branches of `poll()`.  
**Phase 6**: T018 and T019 are frontend-only; can run in parallel with Phase 4/5 once T009 is done.

---

## Parallel Example: Phase 3 (US1)

```
Stream A — Backend:
  T005  Extend operations.repo.ts
  T006  Extend operations.service.ts  (parallel with T005)
  T007  Create operations.controller.ts  (after T005 + T006)
  T008  Verify router.ts registration  (after T007)

Stream B — Frontend:
  T009  Extend board-store.ts sync slice  (parallel with Stream A)
  T010  Create operations-poller.ts skeleton  (parallel with T009)
  T011  Implement applyOperation() dispatch  (after T010)
  T012  Implement full poll() body  (after T009 + T011)
  T013  Wire poller to board page mount/unmount  (after T012)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: Foundational (T003, T004)
3. Complete Phase 3: User Story 1 (T005–T013)
4. **STOP and VALIDATE**: seed board, poll, verify confirmed state matches hydration
5. Ship or demo — the board stays in sync via incremental polling

### Incremental Delivery

1. Phase 1 + 2 → Backend + schema foundation ready
2. Phase 3 (US1) → MVP polling live; test independently
3. Phase 4 (US2) → Large backlogs handled; test with 250-op seed
4. Phase 5 (US3) → Stale recovery live; test with forced stale cursor
5. Phase 6 (US4) → Sync indicator visible in UI
6. Phase 7 → Documentation complete; test checklist passing

### Task Count Summary

| Phase | Tasks | Story |
|-------|-------|-------|
| Phase 1 — Setup | 2 | — |
| Phase 2 — Foundational | 2 | — |
| Phase 3 — US1 (P1) | 9 | Core polling (MVP) |
| Phase 4 — US2 (P2) | 1 | Pagination drain |
| Phase 5 — US3 (P3) | 3 | Stale detection + rehydrate |
| Phase 6 — US4 (P4) | 2 | Sync indicator |
| Phase 7 — Polish | 2 | Cross-cutting |
| **Total** | **21** | |

---

## Notes

- `[P]` tasks = different files, no in-phase dependency — safe to run in parallel
- `[US#]` maps each task to a specific user story for traceability and independent delivery
- US1 is the complete MVP — all four later phases are additive enhancements
- `operations-poller.ts` receives most of the incremental additions; keep the class methods cohesive and avoid multiple simultaneous edits to the same method
- Constitution gates (T001 + T002) must complete before any implementation begins
- Commit after each task or logical group to keep rollback granularity fine
- Stop at each **Checkpoint** to validate the story independently before advancing
