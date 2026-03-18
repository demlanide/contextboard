# contextboard Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-17

## Active Technologies
- TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend (005-node-crud)
- PostgreSQL 15+ (backend source of truth); Zustand normalized store (frontend confirmed state) (005-node-crud)
- TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg), multer (multipart), sharp (image processing/thumbnails) for backend; React 19, React Router 7, Zustand, Vite for frontend (008-assets-image-nodes)
- PostgreSQL 15+ (asset metadata + board state); local filesystem or S3-compatible object storage (asset blobs + thumbnails); Zustand normalized store (frontend confirmed state) (008-assets-image-nodes)
- PostgreSQL 15+ (chat_threads + chat_messages tables); Zustand store (frontend chat state) (009-chat-persistence-board-scoped-durable-chat-thread-with-message-history-selection-context-and-chat-panel-ui)
- TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend; OpenAI SDK or fetch-based LLM client (stubbable) (010-agent-suggest-non-durable-ai-suggestion-flow-with-context-building-action-plan-validation-preview-payload-prompt-entry-ux-and-preview-ui)
- PostgreSQL 15+ (reads existing boards/nodes/edges/assets/chat tables; writes chat_messages only); Zustand store (frontend agent/preview state) (010-agent-suggest-non-durable-ai-suggestion-flow-with-context-building-action-plan-validation-preview-payload-prompt-entry-ux-and-preview-ui)
- TypeScript 5.7+ (Node.js LTS backend, React 19 frontend) + Express HTTP API, Zod validation, node-postgres (pg), React Router, Zustand (011-agent-apply)
- PostgreSQL 15+ as sole durable store for boards, nodes, edges, operations, chat, and agent artifacts (011-agent-apply)

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
- 010-agent-suggest-non-durable-ai-suggestion-flow-with-context-building-action-plan-validation-preview-payload-prompt-entry-ux-and-preview-ui: Added TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend; OpenAI SDK or fetch-based LLM client (stubbable)
- 011-agent-apply: Added TypeScript 5.7+ (Node.js LTS backend, React 19 frontend) + Express HTTP API, Zod validation, node-postgres (pg), React Router, Zustand
- 009-chat-persistence-board-scoped-durable-chat-thread-with-message-history-selection-context-and-chat-panel-ui: Added TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg) for backend; React 19, React Router 7, Zustand, Vite for frontend
- 008-assets-image-nodes: Added TypeScript 5.7+ (Node.js LTS for backend, browser for frontend) + Express (HTTP), Zod (schema validation), node-postgres (pg), multer (multipart), sharp (image processing/thumbnails) for backend; React 19, React Router 7, Zustand, Vite for frontend


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
