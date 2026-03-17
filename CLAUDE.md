# contextboard Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-16

## Active Technologies
- TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend (005-node-crud)
- PostgreSQL 15+ (backend source of truth); Zustand normalized store (frontend confirmed state) (005-node-crud)
- TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg), multer (multipart), sharp (image processing/thumbnails) for backend; React 19, React Router 7, Zustand, Vite for frontend (008-assets-image-nodes)
- PostgreSQL 15+ (asset metadata + board state); local filesystem or S3-compatible object storage (asset blobs + thumbnails); Zustand normalized store (frontend confirmed state) (008-assets-image-nodes)

- TypeScript 5.7+ (matching backend) + React 19, React Router 7, Zustand (state management), Vite (bundler/dev server) (004-create-the-next-feature-spec-for-context-board-mvp-004-frontend-foundation-frontend-app-bootstrap-routing-api-client-board-create-open-flow-hydration-integration-loading-empty-error-states-canvas-and-chat-placeholders-lint-test-baseline)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.7+ (matching backend): Follow standard conventions

## Recent Changes
- 008-assets-image-nodes: Added TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg), multer (multipart), sharp (image processing/thumbnails) for backend; React 19, React Router 7, Zustand, Vite for frontend
- 007-node-batch-mutations: Added TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend
- 006-edge-crud: Added TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
