# Research: Frontend Foundation

**Feature**: 004-frontend-foundation
**Date**: 2026-03-16

## R-001: Frontend Framework

**Decision**: React 19 with Vite

**Rationale**: React is the dominant framework for complex interactive web
applications. The board workspace will grow to include canvas rendering,
drag interactions, real-time state reconciliation, and rich overlays — all
areas where React's component model and ecosystem are mature. Vite
provides fast HMR during development and uses Rollup for optimized
production builds. The backend already uses Vitest, which is Vite-native,
so the test runner is consistent across the monorepo.

**Alternatives considered**:
- **Vue 3 + Vite**: Viable but smaller ecosystem for complex canvas-based
  apps. Fewer libraries for the visual workspace patterns needed in S4+.
- **Svelte/SvelteKit**: Excellent DX but smaller ecosystem for the canvas
  interaction patterns this product will need.
- **Next.js/Remix**: SSR-focused frameworks add complexity not needed for
  a single-user SPA with no SEO requirements and no auth.

## R-002: State Management

**Decision**: Zustand

**Rationale**: The `documentation/frontend-state-sync.md` prescribes a
normalized store with distinct layers (confirmed state, ephemeral state,
sync state, agent state). Zustand provides a lightweight, TypeScript-native
store that supports this shape without boilerplate. It integrates cleanly
with React via hooks and supports middleware (devtools, persist) if needed
later. The store can be structured exactly to the `BoardStore` interface
recommended in the frontend-state-sync doc.

**Alternatives considered**:
- **Redux Toolkit**: More powerful but heavier for MVP. The ceremony of
  slices, actions, and selectors adds boilerplate without proportional
  benefit at this scale. Could migrate later if complexity demands it.
- **Jotai/Recoil**: Atom-based models are harder to map to the normalized
  entity-map shape recommended by frontend-state-sync.md.
- **React Context + useReducer**: Insufficient for the normalized store
  shape needed once nodes/edges/operations are added in later slices.
  Re-renders become problematic with large entity maps.

## R-003: Routing

**Decision**: React Router v7

**Rationale**: Two routes needed now (home `/`, board `/boards/:boardId`).
React Router is the standard client-side routing solution for React SPAs.
v7 is stable and supports route-level data loading patterns if needed later.
The URL-based board routing supports FR-013 (direct URL navigation) and
FR-014 (browser refresh rehydration) naturally.

**Alternatives considered**:
- **TanStack Router**: Type-safe but newer; React Router has broader
  ecosystem support and documentation.
- **Manual history API**: Too low-level for a growing app.

## R-004: API Client Pattern

**Decision**: Typed fetch wrapper with configurable base URL and timeout

**Rationale**: The frontend consumes 3 backend endpoints in this slice.
A thin typed wrapper around `fetch` keeps dependencies minimal, gives full
control over timeout behavior (AbortController), and aligns with the
constitution's explicit budget requirements. The wrapper returns typed
responses matching the backend's `{ data, error }` envelope pattern.

**Alternatives considered**:
- **Axios**: Adds a dependency for features (interceptors, transforms)
  not needed in this slice. fetch is native and sufficient.
- **TanStack Query**: Powerful for caching and request deduplication, but
  adds complexity that conflicts with the "no caching, hydration is
  authoritative" model for this slice. May be introduced in later slices
  for operations polling (S11).
- **OpenAPI codegen (openapi-typescript)**: Would auto-generate types from
  `openapi.yaml`. Worth considering for later slices; for 3 endpoints
  manual typing is simpler and avoids a build dependency.

## R-005: CSS / Styling Approach

**Decision**: Tailwind CSS v4

**Rationale**: Tailwind provides utility-first styling that produces
consistent layouts quickly. The workspace layout (collapsible sidebar +
canvas container) maps directly to flex utilities. No custom CSS
architecture needed for this slice. Tailwind integrates well with Vite
via PostCSS. The design system can grow organically as slices add more
UI components.

**Alternatives considered**:
- **CSS Modules**: More isolated but slower iteration for layout work.
  No shared design tokens without additional tooling.
- **Styled Components / Emotion**: CSS-in-JS adds runtime overhead and
  complexity for a canvas-based app where performance matters in later
  slices.
- **Plain CSS**: No design system constraints; harder to maintain
  consistency as the frontend grows.

## R-006: Testing Strategy

**Decision**: Vitest + React Testing Library (unit/integration) + Playwright (e2e)

**Rationale**: Vitest matches the backend test runner and is Vite-native,
so configuration is minimal. React Testing Library tests component behavior
from a user perspective, matching the acceptance-scenario style of the spec.
Playwright provides real browser e2e testing for the create-and-open flow
required by SC-007. This three-layer strategy covers:
- Unit: store logic, API client, utility functions
- Integration: page-level rendering with mocked API
- E2e: full browser flow against running backend

**Alternatives considered**:
- **Jest**: Not Vite-native; requires additional configuration to work
  with ESM and TypeScript.
- **Cypress**: Heavier than Playwright for the simple e2e flows needed
  now. Playwright runs headless by default and is faster in CI.

## R-007: Default Chat Sidebar State

**Decision**: Chat sidebar expanded by default on first board open

**Rationale**: The product overview describes the chat as "persistent" and
integral to the board experience. Showing it by default communicates that
the workspace is a two-panel environment. Users can collapse it when they
want more canvas space. The collapsed/expanded state does not need to
persist across sessions in this slice.

**Alternatives considered**:
- **Collapsed by default**: Maximizes canvas space but hides a core
  product surface. Users may not discover the chat panel.
- **Persisted in localStorage**: Useful later but unnecessary complexity
  for this foundation slice.

## R-008: Board List Sort Order

**Decision**: Most recently updated first (descending `updatedAt`)

**Rationale**: The backend `GET /boards` endpoint returns boards sorted by
`updatedAt` descending. The frontend will preserve this order without
client-side re-sorting. This is the standard pattern in project/document
listing UIs and matches user expectations.

**Alternatives considered**:
- **Alphabetical**: Less useful for a workspace where recency matters.
- **Client-side sorting options**: Adds UI complexity not needed for MVP.

## R-009: Board Creation UX Pattern

**Decision**: Inline dialog with optional title input

**Rationale**: A lightweight dialog or popover appears when the user clicks
"Create Board." It contains a title field (pre-filled with a default like
"Untitled Board") and a create button. This satisfies FR-003 (optional
title) and FR-004 (double-click protection via disabled button during
request). The dialog pattern keeps the starting screen simple while
offering a clear creation moment.

**Alternatives considered**:
- **One-click create with default title**: Faster but removes the title
  input opportunity, making FR-003 acceptance scenario 1 harder to satisfy.
- **Full-page creation form**: Overkill for a single optional field.
- **Inline form in board list**: Can feel cluttered if the list is long.
