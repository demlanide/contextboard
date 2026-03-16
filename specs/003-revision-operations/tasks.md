# Tasks: Revision + Operations Foundation

**Input**: Design documents from `/specs/003-revision-operations/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/mutation-infrastructure.md, quickstart.md

**Tests**: Included in the final phase. The spec defines test matrix entries T028, T029, T046, T047, T048 and the plan structures three test files (unit: operation-factory, board-mutation; integration: revision-operations). Tests are generated as a dedicated phase after all user stories are complete.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US1, US2, and US5 are combined into a single phase because they share the same service code path — the `withBoardMutation` wrapper and service refactor. Separating them would create artificial boundaries within the same file changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web service**: `backend/src/` at repository root (per plan.md project structure)

---

## Phase 1: Setup (Schema Migration)

**Purpose**: Update the database CHECK constraint to remove unused operation types per S3 clarifications (R-001). This must complete before any code changes to prevent constraint violations.

- [X] T001 Write migration 007_narrow_operation_type.sql in backend/src/db/migrations/ — include data fixup UPDATE to convert any existing create_board/delete_board/archive_board rows to update_board, then DROP and re-ADD the board_operations_operation_type_check constraint with the narrowed enum per data-model.md §1

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure components that MUST be complete before any service refactoring can begin. These components serve all user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Implement `acquireBoardLock(client, boardId)` function in backend/src/db/tx.ts — execute `SELECT pg_advisory_xact_lock(hashtext($1::text))` with the board UUID per contracts/mutation-infrastructure.md §3 and research.md R-002
- [X] T003 Refactor backend/src/domain/operations/operation-factory.ts — update OperationType to remove 'create_board', 'delete_board', 'archive_board'; add full enum per FR-009 (update_board, create_node, update_node, delete_node, restore_node, create_edge, update_edge, delete_edge, create_asset, apply_agent_action_batch, create_snapshot); implement generalized `buildOperation(params: BuildOperationParams): OperationEntry` per contracts/mutation-infrastructure.md §2; define typed payload interfaces (UpdateBoardPayload, UpdateBoardStatusPayload, CreateNodePayload, UpdateNodePayload, DeleteNodePayload, CreateEdgePayload, UpdateEdgePayload, DeleteEdgePayload) per data-model.md §2; retain `updateBoardOperation` as thin convenience wrapper; remove `createBoardOperation`, `archiveBoardOperation`, `deleteBoardOperation`
- [X] T004 Implement `withBoardMutation<T>(boardId, fn)` function in backend/src/db/tx.ts — wraps withTransaction; acquires board lock via acquireBoardLock; loads board and validates existence (throws BOARD_NOT_FOUND if missing/deleted); calls fn with {client, board}; if newRevision is not null, updates boards.revision and boards.updated_at via updateBoardRepo; inserts all returned operations via insertOperation; per contracts/mutation-infrastructure.md §1. Import assertBoardExists from board-rules, updateBoard from boards.repo, insertOperation from operations.repo

**Checkpoint**: Foundation ready — advisory lock, generalized operation factory, and board mutation wrapper are in place. Service refactoring can now begin.

---

## Phase 3: User Story 1+2+5 — Operations Recorded, Revision Predictable, Failed Mutations Clean (Priority: P1) MVP

**Goal**: Refactor all board mutation service methods to use `withBoardMutation` and `buildOperation`. After this phase: every successful mutation writes operations and bumps revision through the wrapper (US1+US2), board creation no longer writes an operation (FR-005), archive and delete use `update_board` with status payload (FR-014), and failed mutations leave no trace because the wrapper rolls back completely (US5).

**Independent Test**: Create a board (verify no operations at revision 0), update title (verify revision=1, one update_board operation with changes/previous payload), archive (verify revision=2, operation with before/after status), delete (verify no revision bump, operation with before/after status). Attempt to update an archived board (verify rejection, revision unchanged, no new operations).

### Implementation for User Story 1+2+5

- [X] T005 [US1] Refactor `createBoard` method in backend/src/services/boards.service.ts — remove the `createBoardOperation` call and `insertOperation` call; board creation keeps using raw `withTransaction` (no existing board to lock); per FR-005 and contracts/mutation-infrastructure.md §4
- [X] T006 [US1] Refactor `updateBoard` method (metadata path) in backend/src/services/boards.service.ts — replace raw `withTransaction` with `withBoardMutation`; remove manual board loading, assertBoardExists, revision computation, and insertOperation calls; use `buildOperation` with operation_type 'update_board', target_type 'board', payload {changes, previous}; return {result, operations, newRevision} per contracts/mutation-infrastructure.md §1 usage example
- [X] T007 [US1] Refactor `updateBoard` method (archive path) in backend/src/services/boards.service.ts — within the `withBoardMutation` callback, detect status field in patch, validate via board-rules, use `buildOperation` with operation_type 'update_board', payload `{before: {status: board.status}, after: {status: 'archived'}}` per FR-014 and contracts/mutation-infrastructure.md §1
- [X] T008 [US1] Refactor `deleteBoard` method in backend/src/services/boards.service.ts — replace raw `withTransaction` with `withBoardMutation`; use `buildOperation` with operation_type 'update_board', payload `{before: {status: board.status}, after: {status: 'deleted'}}`; return newRevision as null (no revision bump on delete) per FR-014 and contracts/mutation-infrastructure.md §1 soft-delete example
- [X] T009 [US1] Update imports in backend/src/services/boards.service.ts — remove imports of createBoardOperation, archiveBoardOperation, deleteBoardOperation from operation-factory; add import of withBoardMutation from db/tx, buildOperation from operation-factory; remove import of withTransaction (no longer directly used by mutation methods); keep withTransaction import only if listBoards/getBoard still use it, otherwise import from a separate read path

**Checkpoint**: US1+US2+US5 complete. All board mutations use withBoardMutation. Operations are written with correct types and payloads. Revision bumps exactly once per mutation. Failed mutations roll back completely. Board creation writes no operation.

---

## Phase 4: User Story 4 — Operations Carry Meaningful Context (Priority: P2)

**Goal**: Verify and enforce that every operation entry carries the correct actor_type, operation_type, target_type, target_id, batch_id, and structured payload. The typed payload interfaces from T003 ensure compile-time correctness; this phase adds runtime validation and structured logging.

**Independent Test**: Perform a board title update and inspect the operation row — verify actor_type='user', operation_type='update_board', target_type='board', target_id=boardId, batch_id=null, payload contains changes/previous with correct field values.

### Implementation for User Story 4

- [X] T010 [US4] Add structured logging for operation writes in backend/src/db/tx.ts within the `withBoardMutation` function — after inserting operations, log at INFO level with boardId, newRevision, operation count, and operation types (e.g., `logger.info('Board mutation committed', { boardId, revision: newRevision, operationCount: ops.length, operationTypes: ops.map(o => o.operation_type) })`)
- [X] T011 [US4] Add inverse_payload computation for board metadata updates in backend/src/services/boards.service.ts — for the metadata update path, set inversePayload to `{changes: previous, previous: changes}` in the buildOperation call per FR-015; for status transitions (archive, delete) set inversePayload to `{before: after, after: before}` where feasible

**Checkpoint**: US4 complete. Operation rows carry all required metadata. Structured logging provides observability. inverse_payload populated where practical.

---

## Phase 5: User Story 3 — Retried Requests Produce Predictable Results (Priority: P2)

**Goal**: Verify that the existing idempotency middleware (from S1) works correctly with the refactored mutation flow. The middleware intercepts requests before they reach the service layer, so the withBoardMutation refactor should be transparent. This phase confirms that idempotent replays do not produce duplicate operations or revision bumps.

**Independent Test**: Send a board update with Idempotency-Key header, replay with same key and payload (verify identical response, no new operations), replay with same key but different payload (verify 409 IDEMPOTENCY_CONFLICT).

### Implementation for User Story 3

- [X] T012 [US3] Verify idempotency scope key includes request path per FR-020 — review backend/src/http/middleware/idempotency.ts `buildScopeKey` function and confirm it uses the operation parameter (which encodes the HTTP method + path); no code change expected unless the scope key format diverges from `{operation}:{boardId|global}:{key}`
- [X] T013 [US3] Verify idempotency key expiry behavior per FR-021 — review backend/src/repos/idempotency.repo.ts `insertKey` function and confirm expires_at is set to created_at + configured TTL (default 24 hours from env.ts IDEMPOTENCY_TTL_HOURS); no code change expected unless TTL is not sourced from config

**Checkpoint**: US3 complete. Idempotency behavior verified against refactored mutation flow. No behavioral changes needed — existing middleware is transparent to the withBoardMutation wrapper.

---

## Phase 6: Testing & Polish

**Purpose**: Validate all acceptance scenarios across all user stories and verify cross-cutting concerns. Ensure no regressions in existing S1/S2 behavior.

- [X] T014 [P] Write unit tests for generalized operation factory in backend/tests/unit/operation-factory.unit.test.ts — test: buildOperation generates UUID id, sets correct fields from params, defaults targetId/batchId/inversePayload to null when omitted, accepts all valid OperationType values, updateBoardOperation convenience wrapper delegates to buildOperation correctly
- [X] T015 [P] Write unit tests for withBoardMutation in backend/tests/unit/board-mutation.unit.test.ts — mock pool/repos; test: acquires advisory lock before callback, loads board and passes to callback, bumps revision when newRevision is not null, skips revision bump when newRevision is null, inserts all returned operations, rolls back on callback error (no operations or revision change), throws BOARD_NOT_FOUND for missing/deleted board
- [X] T016 [P] Update existing unit tests for revision policy in backend/tests/unit/revision-policy.unit.test.ts — verify unchanged behavior: create→0, update→+1, archive→+1, delete→no change; add test that shouldBumpRevision returns false for 'delete' and true for 'update'/'archive'
- [X] T017 Write integration tests for revision+operations invariants in backend/tests/integration/revision-operations.integration.test.ts — against real DB; test: (1) board creation produces zero operation rows and revision=0, (2) title update produces revision=1 and one update_board operation with changes/previous payload, (3) archive produces revision bump and update_board operation with before/after status payload, (4) soft-delete produces no revision bump and update_board operation with before/after status payload, (5) sequential mutations produce monotonic revisions with no gaps, (6) concurrent mutations to same board produce sequential revisions (advisory lock test), (7) failed mutation (e.g., update archived board) produces no operations and no revision change, (8) full lifecycle: create→update×3→archive→delete produces correct revision sequence and operation count
- [X] T018 Update existing HTTP contract tests in backend/tests/contract/boards.contract.test.ts — verify all existing acceptance scenarios still pass with refactored service; add assertion that POST /api/boards response revision=0 and no operation rows exist; add assertion that PATCH response revision increments and operation_type is 'update_board' (not archive_board); add assertion that DELETE produces operation_type 'update_board' (not delete_board)
- [X] T019 Run quickstart.md verification checklist — execute all 6 verification steps from specs/003-revision-operations/quickstart.md: board creation no operation, title update operation, archive status payload, soft-delete no revision bump, no invalid operation types, concurrent mutation serialization
- [X] T020 Code review: verify constitution compliance — confirm advisory lock on all mutation paths, structured logging on operations, no hardcoded timeouts or limits, error envelope consistency, operation factory used exclusively (no ad-hoc operation creation)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 migration — **BLOCKS all user stories**
- **US1+US2+US5 (Phase 3)**: Depends on Phase 2 — core service refactor
- **US4 (Phase 4)**: Depends on Phase 3 — adds logging and inverse_payload to the refactored service
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with Phase 3 (verification of existing middleware, different files)
- **Testing & Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1+US2+US5 (P1)**: Can start after Foundational (Phase 2) — first implementation phase
- **US4 (P2)**: Depends on US1+US2+US5 (adds to the same service file after refactor)
- **US3 (P2)**: Independent of other stories — verifies existing middleware behavior; can start after Phase 2

### Within Each User Story

- Infrastructure (lock, factory, wrapper) before service refactor
- Service refactor before logging and polish
- All implementation before tests

### Parallel Opportunities

Within Phase 2 (after T001 migration runs):
- T002 (acquireBoardLock) and T003 (operation factory) can run in parallel (different files)
- T004 (withBoardMutation) depends on T002 and T003

Within Phase 3:
- T005 through T009 are sequential within the same file (boards.service.ts) — refactor method by method

Across user stories:
- US3 (Phase 5) can run in parallel with US1+US2+US5 (Phase 3) since it verifies different files
- US4 (Phase 4) must follow Phase 3

Within Phase 6:
- T014, T015, T016 (unit tests) can all run in parallel (different files)
- T017 (integration tests) can run after unit tests
- T018 (contract test updates) depends on T017 for confidence
- T019 (quickstart verification) runs after all tests pass

---

## Parallel Example: Phase 2 Foundational

```text
# After T001 migration runs, launch in parallel:
Task T002: "Implement acquireBoardLock in backend/src/db/tx.ts"
Task T003: "Refactor operation-factory.ts to generalized buildOperation"

# After T002 and T003 complete:
Task T004: "Implement withBoardMutation in backend/src/db/tx.ts"
```

## Parallel Example: Testing

```text
# After all user stories are complete, launch unit tests in parallel:
Task T014: "Unit tests for operation factory"
Task T015: "Unit tests for withBoardMutation"
Task T016: "Update revision policy unit tests"

# Then integration tests:
Task T017: "Integration tests for revision+operations invariants"

# Then contract tests:
Task T018: "Update HTTP contract tests"
```

---

## Implementation Strategy

### MVP First (User Story 1+2+5 Only)

1. Complete Phase 1: Setup (migration)
2. Complete Phase 2: Foundational (lock + factory + wrapper)
3. Complete Phase 3: US1+US2+US5 (service refactor)
4. **STOP and VALIDATE**: All board mutations use withBoardMutation. Board creation writes no operation. Archive and delete use update_board. Revision bumps correctly. Failed mutations roll back.
5. This is the minimum deliverable increment

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1+US2+US5 (service refactor) → Test → **MVP deployable**
3. Add US4 (logging + inverse_payload) → Test → Observability complete
4. Add US3 (idempotency verification) → Test → All P2 stories done
5. Add Tests + Polish → Production-ready slice

### Single Developer Strategy

Recommended sequential order for one developer:

1. Phase 1 → Phase 2 (foundational, ~40% of effort)
2. US1+US2+US5 → US4 → US3 (implementation, ~30% of effort)
3. Phase 6 (tests + polish, ~30% of effort)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- US1+US2+US5 are combined because they share the same code path — the withBoardMutation wrapper and boards.service.ts refactor
- US3 is verification-only — the idempotency middleware from S1 is unmodified
- US4 adds observability to behavior already implemented in US1+US2+US5
- The boards.service.ts file is the central implementation file (all mutation methods refactored)
- The operation-factory.ts file gains buildOperation and typed payload interfaces
- The tx.ts file gains acquireBoardLock and withBoardMutation
- Existing tests (revision-policy, board-rules, boards contract/integration) are updated, not replaced
- Commit after each completed phase or user story
- Stop at any checkpoint to validate independently
