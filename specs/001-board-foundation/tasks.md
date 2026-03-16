# Tasks: Board Foundation

**Input**: Design documents from `/specs/001-board-foundation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/boards-api.md, quickstart.md

**Tests**: Included in the final phase. The spec defines 6 test matrix entries (T001–T006) and the plan structures test files. Tests are generated as a dedicated phase after all user stories are complete.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web service**: `backend/src/` at repository root (per plan.md project structure)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the greenfield project skeleton and tooling from scratch. Nothing exists yet.

- [X] T001 Create backend directory structure per plan.md project layout and initialize TypeScript project with package.json (pnpm), tsconfig.json, and .env.example in backend/
- [X] T002 [P] Create Docker Compose config with PostgreSQL 15+ service in docker-compose.yml at repository root
- [X] T003 [P] Configure ESLint + Prettier for TypeScript with standard rules in backend/.eslintrc.cjs and backend/.prettierrc
- [X] T004 [P] Implement environment config loader in backend/src/config/env.ts (PORT, DATABASE_URL, timeouts per quickstart.md) and validation limits in backend/src/config/limits.ts (title 1–200, description 10000, etc.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core persistence, domain logic, HTTP infrastructure, and repositories that MUST be complete before ANY endpoint can work.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Implement database connection pool with explicit pool size and acquisition timeout in backend/src/db/pool.ts
- [X] T006 Implement transaction helper (begin/commit/rollback wrapper) in backend/src/db/tx.ts
- [X] T007 [P] Write SQL migrations 001_create_boards.sql, 002_create_chat_threads.sql, 003_create_board_operations.sql, 004_create_idempotency_keys.sql in backend/src/db/migrations/ per data-model.md DDL (include extended operation_type CHECK from R-001)
- [X] T008 Implement migration runner script (pnpm run db:migrate) in backend/src/db/
- [X] T009 [P] Implement Zod validation schemas for board create, board update (merge-patch), common envelope, and error shapes in backend/src/schemas/board.schemas.ts and backend/src/schemas/common.schemas.ts
- [X] T010 [P] Implement board status transition rules (active→archived, active/archived→deleted, reject all others) in backend/src/domain/validation/board-rules.ts
- [X] T011 [P] Implement revision bump policy (create=0, update=+1, archive=+1, delete=no-bump) in backend/src/domain/revision/revision-policy.ts
- [X] T012 [P] Implement operation log entry factory (create_board, update_board, archive_board, delete_board with payload shapes from data-model.md) in backend/src/domain/operations/operation-factory.ts
- [X] T013 [P] Implement structured JSON logger in backend/src/obs/logger.ts and request duration metrics helper in backend/src/obs/metrics.ts
- [X] T014 Implement repositories: board CRUD queries in backend/src/repos/boards.repo.ts, chat thread insert in backend/src/repos/chat-threads.repo.ts, operation insert in backend/src/repos/operations.repo.ts, idempotency key lookup/insert in backend/src/repos/idempotency.repo.ts
- [X] T015 Create Express 5 app with JSON body parsing in backend/src/main/app.ts, server bootstrap with graceful shutdown in backend/src/main/bootstrap.ts, and empty router skeleton in backend/src/http/router.ts
- [X] T016 [P] Implement HTTP middleware: X-Request-Id generation in backend/src/http/middleware/request-id.ts, global error handler with envelope format in backend/src/http/middleware/error-handler.ts, merge-patch content-type validator in backend/src/http/middleware/content-type.ts
- [X] T017 Implement idempotency middleware (key lookup, fingerprint check, response cache, 409 on mismatch) in backend/src/http/middleware/idempotency.ts

**Checkpoint**: Foundation ready — all persistence, domain rules, middleware, and repos are in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Create a New Board (Priority: P1) MVP

**Goal**: A user creates a new workspace. The system provisions a board (status=active, revision=0, default viewport/settings), auto-creates one chat thread in the same transaction, writes a create_board op-log entry, and returns 201 with both objects.

**Independent Test**: POST /api/boards with a title → verify 201, board fields, revision=0, chatThread present. Verify idempotency replay returns same response.

### Implementation for User Story 1

- [X] T018 [US1] Implement createBoard method in backend/src/services/boards.service.ts — generate board UUID + chat thread UUID, insert board row, insert chat_threads row, write create_board operation, all in single transaction via tx.ts
- [X] T019 [US1] Implement POST /api/boards handler in backend/src/http/controllers/boards.controller.ts — parse body with Zod CreateBoardRequest schema, call service, return 201 with CreateBoardResponse envelope
- [X] T020 [US1] Wire POST /api/boards route in backend/src/http/router.ts with idempotency middleware

**Checkpoint**: User Story 1 complete. A board can be created and the response includes board metadata + chat thread. Idempotency protects against duplicate creates.

---

## Phase 4: User Story 2 — Browse Existing Boards (Priority: P2)

**Goal**: A user sees all their non-deleted boards listed by most recently updated first. Archived boards appear in the list. Empty state returns an empty array, not 404.

**Independent Test**: Create 3 boards (active, archived, deleted) → GET /api/boards → verify only active + archived returned, sorted by updatedAt DESC. Verify empty DB returns `{ boards: [] }`.

### Implementation for User Story 2

- [X] T021 [US2] Implement listBoards method in backend/src/services/boards.service.ts — query boards WHERE status != 'deleted' ORDER BY updated_at DESC
- [X] T022 [US2] Implement GET /api/boards handler in backend/src/http/controllers/boards.controller.ts — call service, return 200 with BoardListResponse envelope

**Checkpoint**: User Story 2 complete. Board listing works independently. Deleted boards excluded, archived boards visible.

---

## Phase 5: User Story 3 — View Board Metadata (Priority: P2)

**Goal**: A user navigates to a specific board and loads its full metadata. Deleted boards return 404. Archived boards return 200 with status=archived.

**Independent Test**: Create a board → GET /api/boards/{boardId} → verify 200 with all fields. Delete it → GET returns 404. Archive a board → GET returns 200 with status=archived.

### Implementation for User Story 3

- [X] T023 [US3] Implement getBoard method in backend/src/services/boards.service.ts — query by id, return 404 BOARD_NOT_FOUND if missing or status=deleted
- [X] T024 [US3] Implement GET /api/boards/:boardId handler in backend/src/http/controllers/boards.controller.ts — validate UUID path param, call service, return 200 with GetBoardResponse envelope or 404

**Checkpoint**: User Story 3 complete. Individual board reads work. Deleted boards are invisible. Archived boards readable.

---

## Phase 6: User Story 4 — Update Board Title and Settings (Priority: P3)

**Goal**: A user renames their board or changes viewport/settings via JSON Merge Patch. The system validates the patch, applies it, increments revision by 1, writes an update_board op-log entry, and returns the updated board. Wrong Content-Type returns 415. Archived or deleted boards are rejected.

**Independent Test**: Create board → PATCH title → verify title changed, revision=1, op-log entry exists. Send application/json → 415. Patch archived board → 422. Patch deleted board → 404.

### Implementation for User Story 4

- [X] T025 [US4] Implement updateBoard method in backend/src/services/boards.service.ts — load board, check editability via board-rules, apply merge-patch fields, bump revision via revision-policy, write update_board operation via operation-factory, all in single transaction
- [X] T026 [US4] Implement PATCH /api/boards/:boardId handler in backend/src/http/controllers/boards.controller.ts — enforce merge-patch content-type via content-type middleware, parse body with Zod UpdateBoardRequest schema, call service, return 200 with GetBoardResponse envelope
- [X] T027 [US4] Wire PATCH /api/boards/:boardId route in backend/src/http/router.ts with content-type middleware and idempotency middleware

**Checkpoint**: User Story 4 complete. Metadata updates work with merge-patch semantics. Revision increments. Op-log records changes. Content-type enforcement active.

---

## Phase 7: User Story 5 — Remove a Board (Priority: P3)

**Goal**: A user deletes a board they no longer need. The board is soft-deleted (status→deleted), disappears from listing and metadata reads (404), but is not physically destroyed. Revision does NOT increment. An op-log entry is written at the current (pre-delete) revision.

**Independent Test**: Create board at revision 3 → DELETE → verify 200 success. GET board → 404. GET /boards list → board absent. Verify op-log entry exists with board_revision=3. DELETE again → 404.

### Implementation for User Story 5

- [X] T028 [US5] Implement deleteBoard method in backend/src/services/boards.service.ts — load board (404 if missing/deleted), set status=deleted and updated_at=now() without revision bump, write delete_board operation at current revision, in single transaction
- [X] T029 [US5] Implement DELETE /api/boards/:boardId handler in backend/src/http/controllers/boards.controller.ts — validate UUID, call service, return 200 with DeleteBoardResponse envelope or 404

**Checkpoint**: User Story 5 complete. Soft-delete works on both active and archived boards. Deleted boards are invisible to list and get endpoints from US2/US3.

---

## Phase 8: User Story 6 — Archived Board Enforces Read-Only (Priority: P4)

**Goal**: A board transitions to archived status via PATCH `{"status":"archived"}`. Archived boards remain visible and readable but reject all durable mutations. The archive transition increments revision and writes an archive_board op-log entry. Un-archive (archived→active) is rejected in MVP.

**Independent Test**: Create board → PATCH `{"status":"archived"}` → verify revision bumped, status=archived, op-log entry. Then PATCH title → 422. PATCH `{"status":"active"}` → 422. DELETE → 200 (archived boards can be deleted).

### Implementation for User Story 6

- [X] T030 [US6] Extend updateBoard in backend/src/services/boards.service.ts to detect status field in patch, delegate to archive transition path — validate active→archived via board-rules, bump revision via revision-policy, write archive_board operation via operation-factory, reject all other status transitions with 422
- [X] T031 [US6] Add archived board rejection to all mutation handlers in backend/src/http/controllers/boards.controller.ts — PATCH on archived board returns 422 (except the status transition itself which is blocked by board-rules), future mutation endpoints inherit this guard from board-rules.ts editability check

**Checkpoint**: User Story 6 complete. Full board lifecycle (active→archived→deleted) works. Archived boards are read-only. All 6 user stories are independently functional.

---

## Phase 9: Testing & Polish

**Purpose**: Validate all acceptance scenarios, apply pre-implementation contract fixes, and verify cross-cutting concerns.

- [X] T032 [P] Apply R-002 fix: add metadata, createdAt, updatedAt to ChatThread schema in documentation/openapi.yaml
- [X] T033 [P] Apply R-003 fix: add status field to UpdateBoardRequest schema in documentation/openapi.yaml
- [X] T034 [P] Write unit tests for board status transitions and field validation in backend/tests/unit/board-rules.unit.test.ts
- [X] T035 [P] Write unit tests for revision bump policy in backend/tests/unit/revision-policy.unit.test.ts
- [X] T036 Write integration tests for full board lifecycle (create→list→get→update→archive→delete) in backend/tests/integration/boards.integration.test.ts
- [X] T037 Write HTTP contract tests for all 5 board endpoints (POST, GET list, GET by id, PATCH, DELETE) covering acceptance scenarios in backend/tests/contract/boards.contract.test.ts
- [X] T038 Run quickstart.md smoke test: docker compose up, migrate, start server, execute all curl commands, verify responses
- [X] T039 Code review: verify structured logging on every endpoint, X-Request-Id propagation, error envelope consistency, and constitution compliance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — first endpoint to implement
- **US2 (Phase 4)**: Depends on Phase 2 — can run parallel with US1 but naturally follows
- **US3 (Phase 5)**: Depends on Phase 2 — can run parallel with US1/US2
- **US4 (Phase 6)**: Depends on Phase 2 — needs US1 complete for meaningful testing
- **US5 (Phase 7)**: Depends on Phase 2 — needs US1 complete for meaningful testing
- **US6 (Phase 8)**: Depends on Phase 2 + US4 (archive extends the PATCH handler in updateBoard)
- **Testing & Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: No story dependencies — creates the first board, first endpoint
- **US2 (P2)**: Logically independent; needs boards to exist for integration testing (US1)
- **US3 (P2)**: Logically independent; needs boards to exist for integration testing (US1)
- **US4 (P3)**: Independent service method; needs boards to exist (US1)
- **US5 (P3)**: Independent service method; needs boards to exist (US1)
- **US6 (P4)**: Extends US4's PATCH handler with status transition; implements after US4

### Within Each User Story

- Service method before controller handler
- Controller handler before route wiring
- Integration with foundational components (repos, domain logic, middleware) assumed ready from Phase 2

### Parallel Opportunities

Within Phase 2 (after T005–T006 pool/tx are done):
- T007 (migrations), T009 (schemas), T010–T012 (domain logic), T013 (logger), T016 (middleware) can all run in parallel
- T014 (repos) needs pool/tx from T005–T006
- T017 (idempotency middleware) needs T014 repos

Across user stories:
- US1, US2, US3 can be developed in parallel (different service methods, different handlers)
- US4 and US5 can be developed in parallel (different service methods)
- US6 must follow US4 (extends same PATCH path)

Within Phase 9:
- T032–T035 (schema fixes + unit tests) can all run in parallel
- T036–T037 (integration + contract tests) are sequential — integration tests before contract tests

---

## Parallel Example: Phase 2 Foundational

```text
# After T005 (pool) and T006 (tx) are complete, launch in parallel:
Task T007: "Write SQL migrations 001–004"
Task T009: "Implement Zod validation schemas"
Task T010: "Implement board status transitions in board-rules.ts"
Task T011: "Implement revision bump policy in revision-policy.ts"
Task T012: "Implement operation log entry factory"
Task T013: "Implement structured logger and metrics"
Task T016: "Implement HTTP middleware (request-id, error-handler, content-type)"

# After parallel tasks complete:
Task T014: "Implement repositories" (needs pool/tx)
Task T015: "Create Express app and router" (needs middleware)
Task T017: "Implement idempotency middleware" (needs repos)
```

## Parallel Example: User Stories

```text
# After Phase 2 foundational is complete, launch US1–US3 in parallel:
Task T018+T019+T020: "US1 — Create Board (service + handler + route)"
Task T021+T022:      "US2 — List Boards (service + handler)"
Task T023+T024:      "US3 — Get Board (service + handler)"

# Then US4 and US5 in parallel:
Task T025+T026+T027: "US4 — Update Board (service + handler + route)"
Task T028+T029:      "US5 — Delete Board (service + handler)"

# Finally US6 (depends on US4):
Task T030+T031:      "US6 — Archive Board (extend update + read-only guard)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 — Create Board
4. **STOP and VALIDATE**: POST /api/boards works, returns 201 with board + chatThread, revision=0
5. This is the minimum deployable increment

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Create) → Test → **MVP deployable**
3. Add US2 + US3 (List + Get) → Test → Full read path
4. Add US4 (Update) → Test → Metadata editing
5. Add US5 (Delete) → Test → Board removal
6. Add US6 (Archive) → Test → Full lifecycle
7. Add Tests + Polish → Production-ready slice

### Single Developer Strategy

Recommended sequential order for one developer:

1. Phase 1 → Phase 2 (foundational, ~60% of effort)
2. US1 → US2 → US3 (create + read paths)
3. US4 → US5 → US6 (mutation paths, building on each other)
4. Phase 9 (tests + polish)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its phase completes
- The boards.service.ts file grows method-by-method across stories (createBoard, listBoards, getBoard, updateBoard, deleteBoard)
- The boards.controller.ts file grows handler-by-handler across stories (one handler per endpoint)
- Commit after each completed phase or user story
- Stop at any checkpoint to validate independently
