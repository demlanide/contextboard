# Quickstart: Board Foundation

**Feature**: 001-board-foundation | **Date**: 2026-03-16

## Prerequisites

- Node.js 22.x LTS
- Docker + Docker Compose (for PostgreSQL)
- pnpm (package manager)

## Local Setup

```bash
# 1. Start PostgreSQL
docker compose up -d db

# 2. Install dependencies
pnpm install

# 3. Run migrations
pnpm run db:migrate

# 4. Start the dev server
pnpm run dev
```

The API starts on `http://localhost:3000/api`.

## Quick Smoke Test

```bash
# Create a board
curl -s -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -d '{"title": "My First Board"}' | jq .

# List boards
curl -s http://localhost:3000/api/boards | jq .

# Get board (replace $BOARD_ID)
curl -s http://localhost:3000/api/boards/$BOARD_ID | jq .

# Update board title
curl -s -X PATCH http://localhost:3000/api/boards/$BOARD_ID \
  -H "Content-Type: application/merge-patch+json" \
  -d '{"title": "Renamed Board"}' | jq .

# Archive board
curl -s -X PATCH http://localhost:3000/api/boards/$BOARD_ID \
  -H "Content-Type: application/merge-patch+json" \
  -d '{"status": "archived"}' | jq .

# Delete board
curl -s -X DELETE http://localhost:3000/api/boards/$BOARD_ID | jq .
```

## Running Tests

```bash
# Unit tests
pnpm run test:unit

# Integration tests (requires running PostgreSQL)
pnpm run test:integration

# Contract tests (requires running API server)
pnpm run test:contract

# All tests
pnpm run test
```

## Implementation Order

This is the recommended order for building the feature slice:

| Step | What | Why |
|------|------|-----|
| 1 | Project scaffolding: `package.json`, `tsconfig.json`, Docker Compose, env config | Foundation for everything |
| 2 | Database: pool, transaction helper, migration runner | Persistence layer |
| 3 | Migrations 001–004 | Tables exist before code runs |
| 4 | Zod schemas (`board.schemas.ts`, `common.schemas.ts`) | Validation before endpoints |
| 5 | Domain logic: `board-rules.ts`, `revision-policy.ts`, `operation-factory.ts` | Business rules independent of HTTP |
| 6 | Repositories: `boards.repo.ts`, `chat-threads.repo.ts`, `operations.repo.ts` | SQL layer |
| 7 | Service: `boards.service.ts` | Transaction orchestration |
| 8 | HTTP: router, controller, middleware (error handler, request-id, content-type, idempotency) | API surface |
| 9 | Observability: structured logger, request metrics | Constitution compliance |
| 10 | Tests: unit → integration → contract | Verify all acceptance scenarios |

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/config/env.ts` | Environment variables, timeout budgets |
| `backend/src/config/limits.ts` | Validation limits (title length, etc.) |
| `backend/src/http/controllers/boards.controller.ts` | HTTP handlers |
| `backend/src/services/boards.service.ts` | Business logic orchestration |
| `backend/src/domain/validation/board-rules.ts` | Status transitions, field rules |
| `backend/src/domain/revision/revision-policy.ts` | When and how to bump revision |
| `backend/src/domain/operations/operation-factory.ts` | Build op-log entries |
| `backend/src/repos/boards.repo.ts` | SQL for boards table |
| `backend/src/db/migrations/` | SQL migration files |

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | 3000 | HTTP server port |
| `DATABASE_URL` | `postgresql://contextboard:contextboard@localhost:5432/contextboard` | PostgreSQL connection |
| `DB_POOL_MAX` | 10 | Connection pool size |
| `DB_STATEMENT_TIMEOUT_MS` | 3000 | Per-statement timeout |
| `DB_POOL_TIMEOUT_MS` | 2000 | Pool acquisition timeout |
| `REQUEST_TIMEOUT_READ_MS` | 2000 | Hard timeout: read endpoints |
| `REQUEST_TIMEOUT_MUTATION_MS` | 5000 | Hard timeout: mutation endpoints |
| `IDEMPOTENCY_TTL_HOURS` | 24 | Key expiry |
| `LOG_LEVEL` | info | Structured log level |
