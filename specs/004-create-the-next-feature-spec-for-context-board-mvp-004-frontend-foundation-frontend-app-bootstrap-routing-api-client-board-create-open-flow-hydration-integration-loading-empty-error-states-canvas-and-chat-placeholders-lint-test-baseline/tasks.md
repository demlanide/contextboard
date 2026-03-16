# Tasks: Frontend Foundation

**Input**: Design documents from `specs/004-frontend-foundation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-consumption.md

**Tests**: Included — US5 explicitly requires linting, test runner, and at least one e2e test (FR-016, FR-017, SC-007).

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the frontend project with Vite, React, TypeScript, and core dependencies.

- [x] T001 Create frontend project: run `npm create vite@latest frontend -- --template react-ts` and verify it starts with `npm run dev` in frontend/
- [x] T002 Install runtime dependencies (react-router, zustand, tailwindcss) and dev dependencies (vitest, @testing-library/react, playwright, eslint, prettier) in frontend/package.json
- [x] T003 [P] Configure Vite dev server with API proxy to backend (`/api` → `http://localhost:3000`) in frontend/vite.config.ts
- [x] T004 [P] Configure TypeScript with strict mode, path aliases, and JSX support in frontend/tsconfig.json
- [x] T005 [P] Configure Tailwind CSS with Vite PostCSS integration in frontend/

**Checkpoint**: `npm run dev` in `frontend/` serves a blank React app with Tailwind working and API proxy active.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 Create environment config with `VITE_API_BASE_URL` and `VITE_API_TIMEOUT_MS` in frontend/src/config/env.ts
- [x] T007 Create typed API client with configurable timeout (AbortController), `{ data, error }` envelope parsing, and SyncError mapping in frontend/src/api/client.ts — follow contracts/api-consumption.md error envelope and error table
- [x] T008 [P] Define all store type interfaces (BoardStore, BoardMeta, BoardNode, BoardEdge, ChatThreadRef, ViewportState, BoardSettings, UIState, SyncState, SyncError, BoardListItem) in frontend/src/store/types.ts — match data-model.md exactly
- [x] T009 Create Zustand board store with initial state, hydrate action (normalize nodes/edges into byId records and order arrays), and reset action in frontend/src/store/board.store.ts — follow data-model.md hydration flow and store reset sections
- [x] T010 [P] Create LoadingSpinner component in frontend/src/components/shared/LoadingSpinner.tsx
- [x] T011 [P] Create ErrorMessage component (accepts message, retryable flag, onRetry callback, optional onBack callback) in frontend/src/components/shared/ErrorMessage.tsx
- [x] T012 [P] Create RetryButton component in frontend/src/components/shared/RetryButton.tsx
- [x] T013 Create React Router setup with two routes: `/` → HomePage, `/boards/:boardId` → BoardPage in frontend/src/App.tsx
- [x] T014 Create app entry point mounting React root with RouterProvider in frontend/src/main.tsx and update frontend/index.html

**Checkpoint**: Foundation ready — app starts, routes resolve, API client can reach backend, store initializes. User story implementation can begin.

---

## Phase 3: User Story 1 — Create a New Board (Priority: P1) 🎯 MVP

**Goal**: User can create a board from the starting screen, navigate to the board workspace, and see the board title with canvas and chat areas.

**Independent Test**: Launch the app, click create, confirm user lands on a real board screen with visible title, empty canvas area, and chat sidebar.

### Implementation for User Story 1

- [x] T015 [US1] Implement createBoard and hydrateBoardState API functions in frontend/src/api/boards.api.ts — createBoard sends POST /api/boards with title, hydrateBoardState sends GET /api/boards/{boardId}/state, both use typed client from T007 and return typed responses per contracts/api-consumption.md
- [x] T016 [US1] Create useBoardHydration hook that calls hydrateBoardState on mount, updates board store (hydrate action), and handles loading/error states in frontend/src/hooks/useBoardHydration.ts — read boardId from URL params via React Router
- [x] T017 [P] [US1] Create CanvasContainer placeholder component (empty structural div that fills available space, ready for node rendering in S4) in frontend/src/components/layout/CanvasContainer.tsx
- [x] T018 [P] [US1] Create ChatSidebar component with collapse/expand toggle, expanded by default (R-007), using flex layout in frontend/src/components/layout/ChatSidebar.tsx — placeholder content, no chat functionality
- [x] T019 [US1] Create BoardHeader component displaying board title in frontend/src/components/layout/BoardHeader.tsx
- [x] T020 [US1] Create BoardWorkspace layout component composing ChatSidebar (left, collapsible) + CanvasContainer (fills remaining width) in frontend/src/components/layout/BoardWorkspace.tsx — when sidebar collapsed, canvas fills full width (FR-008)
- [x] T021 [US1] Create BoardPage that reads boardId from URL, calls useBoardHydration, and renders BoardHeader + BoardWorkspace when hydrated in frontend/src/pages/BoardPage.tsx
- [x] T022 [US1] Create CreateBoardDialog component with title input (default "Untitled Board"), create button with in-flight disable (FR-004), error display, and onSuccess callback that navigates to /boards/{id} in frontend/src/components/boards/CreateBoardDialog.tsx
- [x] T023 [US1] Create minimal HomePage with "Create Board" button that opens CreateBoardDialog in frontend/src/pages/HomePage.tsx
- [x] T024 [US1] Verify US1 end-to-end: start app, click create, enter title, confirm board created on backend, workspace displays with title + canvas + chat sidebar

**Checkpoint**: User Story 1 fully functional — user can create a board and land in a real workspace. This is the MVP.

---

## Phase 4: User Story 2 — Open an Existing Board (Priority: P1)

**Goal**: User sees a list of existing boards on the starting screen, can select one, and opens it in the board workspace with hydrated state.

**Independent Test**: Create a board via US1 or backend seeding, navigate to starting screen, select the board, confirm workspace shows correct title and hydrated state.

### Implementation for User Story 2

- [x] T025 [US2] Add listBoards API function to frontend/src/api/boards.api.ts — sends GET /api/boards, maps response to BoardListItem[] per contracts/api-consumption.md
- [x] T026 [US2] Create useBoards hook that fetches board list on mount and exposes boards array, loading flag, and error in frontend/src/hooks/useBoards.ts
- [x] T027 [P] [US2] Create BoardCard component displaying title, updatedAt, and archived status indicator (visual badge for `status === 'archived'`) with click-to-navigate in frontend/src/components/boards/BoardCard.tsx
- [x] T028 [P] [US2] Create EmptyBoardList component with "No boards yet" message and call-to-action to create first board (FR-002) in frontend/src/components/boards/EmptyBoardList.tsx
- [x] T029 [US2] Create BoardList component rendering BoardCard items or EmptyBoardList when empty in frontend/src/components/boards/BoardList.tsx
- [x] T030 [US2] Update HomePage to show BoardList using useBoards hook alongside the create board action in frontend/src/pages/HomePage.tsx
- [x] T031 [US2] Add read-only indicator (visible badge or banner) to BoardHeader when board status is 'archived' (FR-010a) in frontend/src/components/layout/BoardHeader.tsx
- [x] T032 [US2] Verify US2 end-to-end: boards appear in list with archived distinction, clicking a board opens workspace with correct title, direct URL navigation works (FR-013)

**Checkpoint**: User Stories 1 AND 2 fully functional — user can create boards and open existing ones from the list.

---

## Phase 5: User Story 3 — Board Loading States (Priority: P2)

**Goal**: User always sees a clear loading indicator, empty state, or actionable error — never a blank or ambiguous screen.

**Independent Test**: Simulate slow/failed backend responses, confirm loading, empty, and error states render correctly with retry option.

### Implementation for User Story 3

- [x] T033 [US3] Add loading state rendering (LoadingSpinner) to BoardPage while hydrateStatus is 'loading' in frontend/src/pages/BoardPage.tsx — no stale content shown during loading (FR-007)
- [x] T034 [US3] Add "board not found" error state to BoardPage when error code is BOARD_NOT_FOUND — show message with back-to-home navigation, no retry (FR-010) in frontend/src/pages/BoardPage.tsx
- [x] T035 [US3] Add network/timeout error state with RetryButton to BoardPage for retryable errors (FR-011) in frontend/src/pages/BoardPage.tsx
- [x] T036 [US3] Add loading and error states for board list fetching on HomePage — show spinner while loading, error with retry on failure in frontend/src/pages/HomePage.tsx
- [x] T037 [US3] Enhance CreateBoardDialog error handling — show inline error message on creation failure, keep dialog open, allow retry in frontend/src/components/boards/CreateBoardDialog.tsx

**Checkpoint**: All board load attempts result in loading indicator, content, or actionable error (SC-003). No blank screens.

---

## Phase 6: User Story 4 — Navigation Between Screens (Priority: P2)

**Goal**: User can move freely between starting screen and board workspaces, with consistent state on each transition.

**Independent Test**: Create a board, navigate back, confirm new board in list, open it again, refresh browser on board screen.

### Implementation for User Story 4

- [x] T038 [US4] Create AppShell layout component wrapping all routes with consistent app-level chrome (minimal header/brand) in frontend/src/components/layout/AppShell.tsx — integrate into App.tsx route layout
- [x] T039 [US4] Add back-to-home navigation affordance (link or button) in BoardHeader in frontend/src/components/layout/BoardHeader.tsx
- [x] T040 [US4] Implement board store reset when navigating away from a board — clear all board state to initial values per data-model.md store reset section in frontend/src/store/board.store.ts — trigger via useEffect cleanup in BoardPage
- [x] T041 [US4] Ensure board list refetches on returning to HomePage — useBoards hook should fetch on mount, not cache stale data in frontend/src/hooks/useBoards.ts
- [x] T042 [US4] Verify browser refresh on board screen: page reloads, boardId read from URL, hydration fires, workspace displays correctly (FR-014)

**Checkpoint**: Navigation works freely between screens. Browser refresh on board screen rehydrates correctly.

---

## Phase 7: User Story 5 — Frontend Code Quality Baseline (Priority: P3)

**Goal**: Automated linting and test runner configured, with at least one e2e test validating the create-and-open flow.

**Independent Test**: Run `npm run lint` and `npm test` from frontend/ and confirm they execute with meaningful results.

### Implementation for User Story 5

- [x] T043 [P] [US5] Configure ESLint with TypeScript and React rules in frontend/.eslintrc.cjs — add `lint` script to package.json (FR-016)
- [x] T044 [P] [US5] Configure Prettier with consistent formatting rules in frontend/.prettierrc — add `format` script to package.json
- [x] T045 [US5] Configure Vitest with React Testing Library and jsdom environment in frontend/vitest.config.ts — add `test` script to package.json (FR-017)
- [x] T046 [P] [US5] Write board store unit tests: initial state, hydrate action (normalizes nodes/edges), reset action, error state transitions in frontend/tests/unit/store/board.store.test.ts
- [x] T047 [P] [US5] Write API client unit tests: successful requests, error envelope parsing, timeout handling, SyncError mapping in frontend/tests/unit/api/boards.api.test.ts
- [x] T048 [P] [US5] Write HomePage integration test: renders board list, create dialog opens, handles empty state in frontend/tests/integration/pages/HomePage.test.tsx
- [x] T049 [P] [US5] Write BoardPage integration test: renders loading then workspace after hydration, handles errors in frontend/tests/integration/pages/BoardPage.test.tsx
- [x] T050 [US5] Configure Playwright and write e2e test: create board → navigate to workspace → see title + canvas + chat sidebar (SC-007) in frontend/tests/e2e/board-create-open.spec.ts — add `test:e2e` script to package.json

**Checkpoint**: `npm run lint` passes with zero violations (SC-006). `npm test` runs unit + integration tests. `npm run test:e2e` validates create-and-open flow.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and cleanup across all stories.

- [x] T051 [P] Run ESLint across all frontend source files and fix any violations
- [x] T052 [P] Format all source files with Prettier
- [x] T053 Manually verify all acceptance scenarios from spec.md pass against running backend
- [x] T054 Validate quickstart.md steps: clean install, dev server start, backend proxy, all npm scripts work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — first deliverable
- **US2 (Phase 4)**: Depends on Foundational — can start after US1 or in parallel (shares workspace from US1)
- **US3 (Phase 5)**: Depends on US1 and US2 — adds loading/error states to existing pages
- **US4 (Phase 6)**: Depends on US1 and US2 — adds navigation between existing screens
- **US5 (Phase 7)**: Depends on Foundational only — can start in parallel with US1–US4 (different files)
- **Polish (Phase 8)**: Depends on all stories complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (P1)**: Can start after Phase 2 — reuses workspace layout from US1, so best done after US1 or with coordination
- **US3 (P2)**: Requires US1 + US2 pages to exist — adds states to them
- **US4 (P2)**: Requires US1 + US2 screens — adds navigation between them
- **US5 (P3)**: Can start after Phase 2 — only touches test/lint config and test files (no source file conflicts)

### Within Each User Story

- API functions before hooks that use them
- Hooks before page components that use them
- Layout components before the page that composes them
- Verification task last

### Parallel Opportunities

- T003, T004, T005 can run in parallel (different config files)
- T008, T010, T011, T012 can run in parallel (independent files)
- T017, T018 can run in parallel (independent layout components)
- T027, T028 can run in parallel (independent board list components)
- T043, T044 can run in parallel (lint vs format config)
- T046, T047, T048, T049 can run in parallel (independent test files)
- US5 (Phase 7) can run in parallel with US3/US4 if a separate developer is assigned

---

## Parallel Example: User Story 1

```text
# After Phase 2 complete, launch layout components in parallel:
Task T017: "Create CanvasContainer in frontend/src/components/layout/CanvasContainer.tsx"
Task T018: "Create ChatSidebar in frontend/src/components/layout/ChatSidebar.tsx"

# Then compose them (depends on T017, T018):
Task T020: "Create BoardWorkspace layout in frontend/src/components/layout/BoardWorkspace.tsx"
```

## Parallel Example: User Story 5

```text
# Launch all test files in parallel (after T045 Vitest config):
Task T046: "Board store unit tests in frontend/tests/unit/store/board.store.test.ts"
Task T047: "API client unit tests in frontend/tests/unit/api/boards.api.test.ts"
Task T048: "HomePage integration test in frontend/tests/integration/pages/HomePage.test.tsx"
Task T049: "BoardPage integration test in frontend/tests/integration/pages/BoardPage.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Create a board, land in workspace, see title + canvas + chat
5. Deploy/demo if ready — this is the smallest viable frontend

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Create board + workspace → **MVP!**
3. Add US2 → Board list + open existing boards → Core board lifecycle
4. Add US3 → Loading/error states → Polished UX
5. Add US4 → Navigation → Complete two-screen workflow
6. Add US5 → Tests + lint → Quality gates for future slices
7. Polish → Final cleanup

### Parallel Team Strategy

With two developers:

1. Both complete Setup + Foundational together
2. Developer A: US1 → US3 → US4
3. Developer B: US2 → US5
4. Polish together

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to spec user story for traceability
- Each user story is independently testable at its checkpoint
- The canvas and chat sidebar are structural placeholders — no interactive content in this slice
- Node/edge rendering, chat messaging, and canvas interactions are all deferred to later slices (S4, S5, S8)
- All API requests use the typed client with configurable timeout — no hardcoded values
- The board store follows data-model.md exactly for future-compatible extension
