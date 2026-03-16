# Quickstart: Frontend Foundation

**Feature**: 004-frontend-foundation
**Date**: 2026-03-16

## Prerequisites

- Node.js >= 22.0.0 (matching backend)
- npm (bundled with Node.js)
- Backend running locally (see `backend/` README)
- PostgreSQL running with migrations applied

## Setup

```bash
cd frontend
npm install
```

## Development

Start the dev server with hot module replacement:

```bash
npm run dev
```

The app opens at `http://localhost:5173` by default. The dev server proxies
API requests to the backend at `http://localhost:3000/api` (configurable
via `VITE_API_BASE_URL`).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api` | Backend API base URL. In dev, Vite proxy forwards to backend. |
| `VITE_API_TIMEOUT_MS` | `10000` | Default API request timeout in milliseconds. |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint on all source files |
| `npm run format` | Run Prettier on all source files |
| `npm test` | Run Vitest (unit + integration tests) |
| `npm run test:e2e` | Run Playwright e2e tests (requires running backend) |

## Running with Backend

1. Start the backend:
   ```bash
   cd backend
   npm run db:migrate
   npm run dev
   ```

2. In another terminal, start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open `http://localhost:5173` in your browser.

## Running Tests

### Unit and Integration Tests

```bash
cd frontend
npm test
```

These tests mock API calls and do not require a running backend.

### E2E Tests

```bash
cd frontend
npm run test:e2e
```

E2E tests require both the backend and frontend to be running. Playwright
launches a real browser and exercises the create-board and open-board flows.

## Project Structure

```text
frontend/
  index.html              # Vite entry point
  vite.config.ts          # Vite + proxy configuration
  tsconfig.json           # TypeScript configuration
  package.json            # Dependencies and scripts
  .eslintrc.cjs           # ESLint configuration
  src/
    main.tsx              # React root mount
    App.tsx               # Router setup
    config/
      env.ts              # Environment variable access
    api/
      client.ts           # Typed fetch wrapper with timeout
      boards.api.ts       # Board-specific API functions
    store/
      board.store.ts      # Zustand board store
      types.ts            # Store type definitions
    pages/
      HomePage.tsx         # Starting screen with board list
      BoardPage.tsx        # Board workspace screen
    components/
      layout/             # Workspace layout components
      boards/             # Board list and creation components
      shared/             # Reusable UI components
    hooks/
      useBoards.ts        # Board list fetching hook
      useBoardHydration.ts # Board state hydration hook
  tests/
    unit/                 # Store and API unit tests
    integration/          # Page-level integration tests
    e2e/                  # Playwright browser tests
```
