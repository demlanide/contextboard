# Implementation Plan: Frontend Foundation

**Branch**: `004-frontend-foundation` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/004-frontend-foundation/spec.md`

## Summary

Bootstrap the Context Board web application as a single-page app that can
create boards, list boards, open a board workspace, and hydrate the full
board state from the backend. The workspace provides a collapsible chat
sidebar on the left and a canvas container that fills the remaining space.
Loading, empty, error, and archived-board states are handled explicitly.
Node and edge rendering on the canvas is deferred to later slices; this
slice proves the hydration pipeline, workspace layout, and navigation
foundation. Frontend linting and a test runner are configured as quality
gates for all future frontend work.

## Technical Context

**Language/Version**: TypeScript 5.7+ (matching backend)
**Primary Dependencies**: React 19, React Router 7, Zustand (state management), Vite (bundler/dev server)
**Storage**: N/A — backend is source of truth; local state held in Zustand store
**Testing**: Vitest + React Testing Library (unit/integration), Playwright (e2e)
**Target Platform**: Modern desktop browsers (Chrome, Firefox, Safari, Edge — latest 2 versions)
**Project Type**: Web application (SPA) — frontend counterpart to the existing backend modular monolith
**Performance Goals**: <3s board create-to-workspace, <3s board open-to-loaded (SC-001, SC-002)
**Constraints**: Backend is sole source of truth; no auth; single user; API base URL configurable via environment
**Scale/Scope**: 2 screens, ~10 components, 3 API integrations (list boards, create board, hydrate board state)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Backend Source of Truth | PASS | FR-015: workspace treats backend hydration response as authoritative. No local override of server state. |
| II | Revision as Sync Primitive | PASS | Revision stored from hydration response; never modified locally. Store shape includes `lastSyncedRevision`. |
| III | Operations-First Mutation | PASS-THROUGH | Board creation goes through backend which handles operation logging. Frontend does not write operations directly. |
| IV | Suggest/Apply Separation | N/A | No agent flows in this slice. |
| V | Atomic Batch Durability | N/A | No batch mutations in this slice. |
| VI | Contract-First Implementation | PASS | Consumes existing OpenAPI-defined endpoints (POST /boards, GET /boards, GET /boards/{boardId}/state). No new backend API surface. |
| VII | Vertical Slice Testability | PASS | 5 independently testable user stories; e2e test covers create-and-open flow; unit tests cover store and API client. |
| VIII | Modular Monolith | PASS | Frontend follows modular structure: api/, store/, pages/, components/. Clear separation of concerns. |
| IX | Correctness Over Optimization | PASS | No optimistic updates in this slice. Hydration response replaces local state entirely. No caching. |
| X | Explicit Budgets | PASS | API request timeouts configurable via environment. No hardcoded limits. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-frontend-foundation/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: frontend store shape and entities
├── quickstart.md        # Phase 1: local development setup
├── contracts/
│   └── api-consumption.md  # Phase 1: backend API consumption contract
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
frontend/
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  .eslintrc.cjs
  src/
    main.tsx
    App.tsx
    config/
      env.ts
    api/
      client.ts
      boards.api.ts
    store/
      board.store.ts
      types.ts
    pages/
      HomePage.tsx
      BoardPage.tsx
    components/
      layout/
        AppShell.tsx
        BoardWorkspace.tsx
        ChatSidebar.tsx
        CanvasContainer.tsx
        BoardHeader.tsx
      boards/
        BoardList.tsx
        BoardCard.tsx
        CreateBoardDialog.tsx
        EmptyBoardList.tsx
      shared/
        LoadingSpinner.tsx
        ErrorMessage.tsx
        RetryButton.tsx
    hooks/
      useBoards.ts
      useBoardHydration.ts
  tests/
    unit/
      store/
        board.store.test.ts
      api/
        boards.api.test.ts
    integration/
      pages/
        HomePage.test.tsx
        BoardPage.test.tsx
    e2e/
      board-create-open.spec.ts
```

**Structure Decision**: Frontend lives in a top-level `frontend/` directory
alongside the existing `backend/` directory. This matches the web
application layout option from the plan template and mirrors the existing
project convention. Internal structure separates API client, Zustand store,
page-level components, and reusable UI components with clear boundaries
that later slices (S4 Nodes CRUD, S5 Edges CRUD, S8 Chat) can extend
without restructuring.

## Constitution Check — Post-Design Re-evaluation

| # | Principle | Pre-design | Post-design | Notes |
|---|-----------|------------|-------------|-------|
| I | Backend Source of Truth | PASS | PASS | Store replaces confirmed state entirely on hydrate; no local overrides |
| II | Revision as Sync Primitive | PASS | PASS | `board.revision` and `sync.lastSyncedRevision` both set from server response only |
| III | Operations-First Mutation | PASS-THROUGH | PASS-THROUGH | Board creation calls backend which handles ops logging |
| IV | Suggest/Apply Separation | N/A | N/A | No agent flows |
| V | Atomic Batch Durability | N/A | N/A | No batch mutations |
| VI | Contract-First Implementation | PASS | PASS | API consumption contract documents exact request/response shapes from OpenAPI |
| VII | Vertical Slice Testability | PASS | PASS | e2e test for create+open, unit tests for store and API, integration tests for pages |
| VIII | Modular Monolith | PASS | PASS | Clean module boundaries: api/ for network, store/ for state, pages/ for routes, components/ for UI |
| IX | Correctness Over Optimization | PASS | PASS | No caching, no optimistic state, hydration always authoritative |
| X | Explicit Budgets | PASS | PASS | API timeout in `config/env.ts`; no hardcoded values |

**Post-design gate result**: PASS — no violations.

## Complexity Tracking

No constitution violations to justify.
