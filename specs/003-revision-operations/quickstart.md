# Quickstart: Revision + Operations Foundation

**Feature**: 003-revision-operations | **Date**: 2026-03-16

## Prerequisites

- S1 (Board Foundation) and S2 (Board State Hydration) implemented
- Node.js 22.x LTS
- Docker + Docker Compose (for PostgreSQL)
- pnpm (package manager)

## Local Setup

```bash
# 1. Start PostgreSQL (if not already running)
docker compose up -d db

# 2. Install dependencies (if new packages added)
pnpm install

# 3. Run migrations (applies 007_narrow_operation_type.sql)
pnpm run db:migrate

# 4. Start the dev server
pnpm run dev
```

## Verification Checklist

S3 is a refactoring slice — no new endpoints are added. Verify by
exercising existing board mutation endpoints and inspecting the
operation log.

### 1. Board creation no longer writes an operation

```bash
# Create a board
BOARD_ID=$(curl -s -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -d '{"title": "S3 Test Board"}' | jq -r '.data.board.id')

echo "Board ID: $BOARD_ID"

# Query the operations table directly — should be empty for this board
docker compose exec db psql -U contextboard -c \
  "SELECT count(*) FROM board_operations WHERE board_id = '$BOARD_ID';"
# Expected: 0
```

### 2. Board title update writes an update_board operation

```bash
# Update the title
curl -s -X PATCH http://localhost:3000/api/boards/$BOARD_ID \
  -H "Content-Type: application/merge-patch+json" \
  -d '{"title": "Renamed Board"}' | jq '.data.revision'
# Expected: 1

# Check the operation
docker compose exec db psql -U contextboard -c \
  "SELECT operation_type, board_revision, payload FROM board_operations
   WHERE board_id = '$BOARD_ID' ORDER BY created_at;"
# Expected: 1 row, operation_type = 'update_board', board_revision = 1,
# payload contains changes/previous
```

### 3. Board archival writes update_board with status payload

```bash
# Archive the board
curl -s -X PATCH http://localhost:3000/api/boards/$BOARD_ID \
  -H "Content-Type: application/merge-patch+json" \
  -d '{"status": "archived"}' | jq '.data.revision'
# Expected: 2

# Check the operation
docker compose exec db psql -U contextboard -c \
  "SELECT operation_type, payload FROM board_operations
   WHERE board_id = '$BOARD_ID' AND board_revision = 2;"
# Expected: operation_type = 'update_board',
# payload like {"before": {"status": "active"}, "after": {"status": "archived"}}
```

### 4. Board soft-delete writes update_board without revision bump

```bash
# Delete the board
curl -s -X DELETE http://localhost:3000/api/boards/$BOARD_ID | jq .

# Check the operation — should be at revision 2 (no bump)
docker compose exec db psql -U contextboard -c \
  "SELECT operation_type, board_revision, payload FROM board_operations
   WHERE board_id = '$BOARD_ID' ORDER BY created_at;"
# Expected: 3 rows total
# Last row: operation_type = 'update_board', board_revision = 2,
# payload like {"before": {"status": "archived"}, "after": {"status": "deleted"}}
```

### 5. No invalid operation types in the database

```bash
docker compose exec db psql -U contextboard -c \
  "SELECT DISTINCT operation_type FROM board_operations;"
# Expected: only 'update_board' (no 'create_board', 'delete_board', 'archive_board')
```

### 6. Advisory lock test (concurrent mutations)

```bash
# Create a fresh board
BOARD_ID2=$(curl -s -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -d '{"title": "Concurrency Test"}' | jq -r '.data.board.id')

# Fire two concurrent updates
curl -s -X PATCH http://localhost:3000/api/boards/$BOARD_ID2 \
  -H "Content-Type: application/merge-patch+json" \
  -d '{"title": "Update A"}' &
curl -s -X PATCH http://localhost:3000/api/boards/$BOARD_ID2 \
  -H "Content-Type: application/merge-patch+json" \
  -d '{"title": "Update B"}' &
wait

# Check revisions — should be 1 and 2, no gaps
docker compose exec db psql -U contextboard -c \
  "SELECT board_revision FROM board_operations
   WHERE board_id = '$BOARD_ID2' ORDER BY board_revision;"
# Expected: 1, 2
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

## Key Files (Changed or New)

| File | Change |
|------|--------|
| `backend/src/db/migrations/007_narrow_operation_type.sql` | NEW — migration to update CHECK |
| `backend/src/db/tx.ts` | MODIFIED — add `acquireBoardLock`, `withBoardMutation` |
| `backend/src/domain/operations/operation-factory.ts` | MODIFIED — generalize to `buildOperation` |
| `backend/src/services/boards.service.ts` | MODIFIED — use `withBoardMutation`, remove create op |
| `backend/tests/unit/operation-factory.unit.test.ts` | NEW — test generalized factory |
| `backend/tests/unit/board-mutation.unit.test.ts` | NEW — test withBoardMutation |
| `backend/tests/integration/revision-operations.integration.test.ts` | NEW — test invariants |

## Implementation Order

| Step | What | Why |
|------|------|-----|
| 1 | Migration 007 | Schema must be updated before code changes |
| 2 | `acquireBoardLock` in tx.ts | Infrastructure for serialization |
| 3 | Refactor `operation-factory.ts` to `buildOperation` | Generalized factory before service changes |
| 4 | `withBoardMutation` in tx.ts | Mutation wrapper before service refactor |
| 5 | Refactor `boards.service.ts` | Apply new patterns to existing mutations |
| 6 | Unit tests | Verify domain logic in isolation |
| 7 | Integration tests | Verify transactional invariants |
| 8 | Contract tests | Verify HTTP-level behavior unchanged |
