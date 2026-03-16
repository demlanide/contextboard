# Tasks: Board State Hydration

**Input**: Design documents from `/specs/002-board-state-hydration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/board-state-api.md, quickstart.md

**Tests**: Included in the final phase. The spec defines test matrix entry T007 and the plan structures three test files (contract, integration, unit). Tests are generated as a dedicated phase after all user stories are complete.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US1 and US2 are combined into a single phase because they share the same code path (populated vs empty board) and are both P1. This is a single-endpoint feature (`GET /boards/{boardId}/state`) where each user story exercises a different behavioral aspect of the same read-only endpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web service**: `backend/src/` at repository root (per plan.md project structure)

---

## Phase 1: Setup (Table Migrations)

**Purpose**: Create the board_nodes and board_edges tables as read-side prerequisites (R-002). These tables will be empty until S4/S5 add node/edge CRUD. The hydration endpoint returns empty arrays, which is the correct empty-board behavior.

- [X] T001 Create migration for board_nodes table with all columns, constraints, and indexes from data-model.md in backend/src/db/migrations/005_create_board_nodes.sql
- [X] T002 [P] Create migration for board_edges table with all columns, constraints, and indexes from data-model.md in backend/src/db/migrations/006_create_board_edges.sql

---

## Phase 2: Foundational (Repos, Types, Schemas)

**Purpose**: Repository read methods and TypeScript types that MUST be complete before the hydration service can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Implement nodes repository with findActiveByBoardId method and mapNodeRow helper (snake_case → camelCase per R-005) in backend/src/repos/nodes.repo.ts
- [X] T004 [P] Implement edges repository with findActiveByBoardId method and mapEdgeRow helper (snake_case → camelCase per R-005) in backend/src/repos/edges.repo.ts
- [X] T005 [P] Add findByIdExcludingDeleted method to backend/src/repos/boards.repo.ts if not already present — query: `SELECT * FROM boards WHERE id = $1 AND status <> 'deleted'`
- [X] T006 [P] Add findByBoardId method to backend/src/repos/chat-threads.repo.ts if not already present — query: `SELECT * FROM chat_threads WHERE board_id = $1`
- [X] T007 [P] Define Node, Edge, and BoardState TypeScript interfaces matching OpenAPI camelCase field names in backend/src/schemas/board-state.schemas.ts

**Checkpoint**: Foundation ready — all repositories can read board, nodes, edges, and chat thread data. User story implementation can now begin.

---

## Phase 3: User Story 1+2 — Load Board Workspace / Empty Board (Priority: P1) MVP

**Goal**: A user navigates to a board and the system returns the complete workspace state in one request. For a newly created board, the response contains empty node and edge arrays. The response includes board metadata, active (non-deleted) nodes ordered by zIndex then createdAt, active edges ordered by createdAt, chat thread metadata, and lastOperationRevision equal to board.revision.

**Independent Test**: Create a board (optionally seed nodes/edges via DB), call GET /boards/{boardId}/state, verify 200 with correct envelope. Create empty board, verify 200 with empty arrays and revision=0.

### Implementation for User Story 1+2

- [X] T008 [US1] Implement getBoardState method in backend/src/services/board-state.service.ts — fetch board (fail fast with NotFoundError if missing/deleted), then parallel-fetch nodes, edges, chat thread via Promise.all; throw InternalError if chat thread missing (R-004); assemble response with lastOperationRevision from board.revision
- [X] T009 [US1] Implement GET /boards/:boardId/state handler in backend/src/http/controllers/board-state.controller.ts — validate boardId as UUID (return 400 VALIDATION_ERROR if malformed per FR-011), call board-state service, return 200 with { data, error: null } envelope
- [X] T010 [US1] Register GET /boards/:boardId/state route in backend/src/http/router.ts

**Checkpoint**: Core hydration works. Active boards return full state. Empty boards return valid envelope with empty arrays. Malformed UUIDs return 400. Deleted/nonexistent boards return 404. Missing chat thread returns 500.

---

## Phase 4: User Story 3 — Deleted Board Returns Not Found (Priority: P2)

**Goal**: A user attempts to load a soft-deleted or nonexistent board. The system responds with 404 BOARD_NOT_FOUND. The deleted board's data is never exposed.

**Independent Test**: Create a board, soft-delete it, call GET /boards/{boardId}/state → verify 404 with error code BOARD_NOT_FOUND. Call with nonexistent UUID → verify 404.

### Implementation for User Story 3

- [X] T011 [US3] Verify deleted board and nonexistent board handling in backend/src/services/board-state.service.ts — the findByIdExcludingDeleted query already filters status='deleted'; add explicit error log at WARN level with boardId when board not found for operational visibility

**Checkpoint**: Deleted and nonexistent boards consistently return 404 BOARD_NOT_FOUND with the standard error envelope.

---

## Phase 5: User Story 5 — State Response Shape is Stable (Priority: P2)

**Goal**: The frontend relies on one stable hydration contract. The response envelope shape is identical regardless of board content — only array contents vary. The Zod schema enforces this at the boundary.

**Independent Test**: Compare response shapes across empty, single-node, and multi-node boards — all must conform to the same envelope structure with the same top-level keys.

### Implementation for User Story 5

- [X] T012 [US5] Define Zod response validation schema for GetBoardStateResponse in backend/src/schemas/board-state.schemas.ts — schema must match OpenAPI GetBoardStateResponse exactly: data.board (object), data.nodes (array), data.edges (array), data.chatThread (object), data.lastOperationRevision (integer), error (null); export for use in contract tests

**Checkpoint**: Response shape is enforced by Zod schema. All boards (empty, populated, archived) return identical envelope structure.

---

## Phase 6: User Story 4 — Archived Board State is Readable (Priority: P3)

**Goal**: A user navigates to an archived board. The system returns the full state envelope with board status 'archived', allowing read-only viewing. The lastOperationRevision reflects the revision at archival time.

**Independent Test**: Create a board, archive it (via PATCH from S1), call GET /boards/{boardId}/state → verify 200 with status='archived' and full state.

### Implementation for User Story 4

- [X] T013 [US4] Verify archived board handling in backend/src/services/board-state.service.ts — the findByIdExcludingDeleted query already returns archived boards (status <> 'deleted' includes 'archived'); add structured INFO log when serving archived board state for observability

**Checkpoint**: Archived boards return 200 with full state. The board object shows status='archived'. All user stories are now independently functional.

---

## Phase 7: Testing & Polish

**Purpose**: Validate all acceptance scenarios across all user stories and verify cross-cutting concerns.

- [X] T014 [P] Write unit tests for board-state service in backend/tests/unit/board-state.unit.test.ts — mock repos, test: board not found → NotFoundError, chat thread missing → InternalError, happy path returns assembled state with correct lastOperationRevision, empty nodes/edges arrays for empty board
- [X] T015 [P] Write integration tests for hydration queries in backend/tests/integration/board-state.integration.test.ts — seed DB, test: node ordering (z_index ASC, created_at ASC), edge ordering (created_at ASC), soft-deleted entities excluded, lastOperationRevision matches board.revision, mixed node types returned, chat thread always present
- [X] T016 Write HTTP contract tests for GET /boards/:boardId/state in backend/tests/contract/board-state.contract.test.ts — test all acceptance scenarios: active board with nodes/edges → 200, empty board → 200 with empty arrays, soft-deleted entities excluded → 200, deleted board → 404, nonexistent board → 404, archived board → 200 with status='archived', malformed UUID → 400
- [X] T017 Run quickstart.md verification checklist: confirm migrations 005+006 run, empty board returns valid state, seeded nodes return only active nodes, deleted board returns 404, archived board returns 200, lastOperationRevision equals revision, malformed UUID returns 400, response shape matches OpenAPI

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately (assumes S1 foundation is deployed)
- **Foundational (Phase 2)**: Depends on Phase 1 migrations — **BLOCKS all user stories**
- **US1+US2 (Phase 3)**: Depends on Phase 2 — core endpoint implementation
- **US3 (Phase 4)**: Depends on Phase 3 — adds observability to existing behavior
- **US5 (Phase 5)**: Depends on Phase 2 — can run in parallel with Phase 3 (different file: schemas vs service/controller)
- **US4 (Phase 6)**: Depends on Phase 3 — adds observability to existing behavior
- **Testing & Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1+US2 (P1)**: No story dependencies — first implementation, creates the endpoint
- **US3 (P2)**: Logically independent; endpoint behavior already correct from US1 implementation; adds observability
- **US5 (P2)**: Logically independent; can be developed in parallel with US1 (different file)
- **US4 (P3)**: Logically independent; endpoint behavior already correct from US1 implementation; adds observability

### Within Each User Story

- Repository methods before service method
- Service method before controller handler
- Controller handler before route registration
- Schema definitions can run in parallel with other work (different files)

### Parallel Opportunities

Within Phase 1:
- T001 and T002 can run in parallel (different migration files)

Within Phase 2:
- T003, T004, T005, T006, T007 can all run in parallel (different files)

Across user stories:
- US5 (T012 — Zod schema) can run in parallel with US1+US2 (T008–T010) since they touch different files
- US3 (T011) and US4 (T013) are sequential after US1+US2 as they modify the same service file

Within Phase 7:
- T014 (unit tests) and T015 (integration tests) can run in parallel (different files)
- T016 (contract tests) depends on T014+T015 being complete for confidence
- T017 (quickstart validation) runs after all tests pass

---

## Parallel Example: Phase 2 Foundational

```text
# All foundational tasks can run in parallel (different files):
Task T003: "Implement nodes.repo.ts with findActiveByBoardId"
Task T004: "Implement edges.repo.ts with findActiveByBoardId"
Task T005: "Add findByIdExcludingDeleted to boards.repo.ts"
Task T006: "Add findByBoardId to chat-threads.repo.ts"
Task T007: "Define Node, Edge, BoardState interfaces in board-state.schemas.ts"
```

## Parallel Example: US1+US2 and US5

```text
# After Phase 2, launch in parallel:
Task T008+T009+T010: "US1+US2 — service + controller + route"
Task T012:           "US5 — Zod response schema in board-state.schemas.ts"

# Then sequentially:
Task T011: "US3 — deleted board observability in service"
Task T013: "US4 — archived board observability in service"
```

---

## Implementation Strategy

### MVP First (User Story 1+2 Only)

1. Complete Phase 1: Setup (migrations)
2. Complete Phase 2: Foundational (repos, types)
3. Complete Phase 3: US1+US2 — Core hydration endpoint
4. **STOP and VALIDATE**: GET /boards/{boardId}/state returns 200 with correct envelope for both populated and empty boards
5. This is the minimum deployable increment

### Incremental Delivery

1. Setup + Foundational → Tables exist, repos ready
2. Add US1+US2 (core hydration) → Test → **MVP deployable**
3. Add US3 + US5 (deleted board handling + shape enforcement) → Test → P2 complete
4. Add US4 (archived board) → Test → P3 complete
5. Add Tests + Polish → Production-ready slice

### Single Developer Strategy

Recommended sequential order for one developer:

1. Phase 1 → Phase 2 (foundational, ~40% of effort)
2. US1+US2 → US5 → US3 → US4 (endpoint + behaviors, ~30% of effort)
3. Phase 7 (tests + polish, ~30% of effort)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- US1+US2 are combined because they share the same code path — empty board is a data state, not a different implementation
- US3, US4, and US5 primarily add observability and validation to behavior that is already correct from the core US1 implementation
- The board-state.service.ts file is the central implementation file (getBoardState method)
- The board-state.controller.ts file has one handler (GET)
- Existing repos (boards.repo.ts, chat-threads.repo.ts) may need minor additions (new query methods)
- Commit after each completed phase or user story
- Stop at any checkpoint to validate independently
