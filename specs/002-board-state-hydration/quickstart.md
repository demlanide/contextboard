# Quickstart: Board State Hydration

**Feature**: 002-board-state-hydration | **Date**: 2026-03-16

This guide provides a concise implementation path for the board state
hydration endpoint.

---

## Prerequisites

- S1 (Board Foundation) is complete and deployed
- Migrations 001–004 have run (boards, chat_threads, board_operations,
  idempotency_keys tables exist)
- Backend app starts and serves existing board endpoints

---

## Step 1: Run New Migrations

Create and run two new migration files:

1. **005_create_board_nodes.sql** — Creates the `board_nodes` table
   with all columns, constraints, and indexes from the data-model.md.
2. **006_create_board_edges.sql** — Creates the `board_edges` table
   with all columns, constraints, and indexes from the data-model.md.

These tables will be empty until S4/S5 add node/edge CRUD. The
hydration endpoint returns empty arrays for these, which is the
correct empty-board behavior.

---

## Step 2: Add Repository Read Methods

### nodes.repo.ts (NEW)

Add a `findActiveByBoardId(boardId: string)` method:

```typescript
async findActiveByBoardId(boardId: string): Promise<Node[]> {
  const result = await this.pool.query(
    `SELECT * FROM board_nodes
     WHERE board_id = $1 AND deleted_at IS NULL
     ORDER BY z_index ASC, created_at ASC`,
    [boardId]
  );
  return result.rows.map(mapNodeRow);
}
```

### edges.repo.ts (NEW)

Add a `findActiveByBoardId(boardId: string)` method:

```typescript
async findActiveByBoardId(boardId: string): Promise<Edge[]> {
  const result = await this.pool.query(
    `SELECT * FROM board_edges
     WHERE board_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [boardId]
  );
  return result.rows.map(mapEdgeRow);
}
```

### Existing repos

Ensure `boards.repo.ts` has a method to load a board by ID excluding
deleted boards (likely exists from S1). Ensure
`chat-threads.repo.ts` has a `findByBoardId` method.

---

## Step 3: Implement Board State Service

### board-state.service.ts (NEW)

```typescript
async getBoardState(boardId: string): Promise<BoardStateResponse> {
  const board = await this.boardsRepo.findByIdExcludingDeleted(boardId);
  if (!board) {
    throw new NotFoundError('BOARD_NOT_FOUND', 'Board not found');
  }

  const [nodes, edges, chatThread] = await Promise.all([
    this.nodesRepo.findActiveByBoardId(boardId),
    this.edgesRepo.findActiveByBoardId(boardId),
    this.chatThreadsRepo.findByBoardId(boardId),
  ]);

  if (!chatThread) {
    throw new InternalError('INTERNAL_ERROR',
      'Board state could not be loaded');
  }

  return {
    board,
    nodes,
    edges,
    chatThread,
    lastOperationRevision: board.revision,
  };
}
```

Key points:
- Board lookup first — fail fast if not found or deleted.
- Parallel fetch for nodes, edges, and chat thread after board is
  confirmed.
- Missing chat thread is a 500 (data integrity failure).
- `lastOperationRevision` comes directly from `board.revision`.

---

## Step 4: Add Controller and Route

### board-state.controller.ts (NEW)

```typescript
async getBoardState(req: Request, res: Response): Promise<void> {
  const boardId = validateUuid(req.params.boardId);
  const state = await this.boardStateService.getBoardState(boardId);

  res.json({
    data: state,
    error: null,
  });
}
```

### Router registration

```typescript
router.get('/boards/:boardId/state', boardStateController.getBoardState);
```

---

## Step 5: Add Response Schema

### board-state.schemas.ts (NEW)

Define a Zod schema for the response shape that matches the OpenAPI
`GetBoardStateResponse`. This can be used for response validation in
tests.

---

## Step 6: Write Tests

### Contract tests (board-state.contract.test.ts)

Test the HTTP interface against the OpenAPI contract:

1. Active board with seeded nodes/edges → 200, correct shape
2. Empty board → 200, empty arrays
3. Board with soft-deleted entities → 200, excludes deleted
4. Deleted board → 404 BOARD_NOT_FOUND
5. Nonexistent board → 404 BOARD_NOT_FOUND
6. Archived board → 200, status = "archived"
7. Malformed UUID → 400

### Integration tests (board-state.integration.test.ts)

Test against a real database:

1. Verify node ordering (z_index ASC, created_at ASC)
2. Verify edge ordering (created_at ASC)
3. Verify `lastOperationRevision` matches board revision
4. Verify chat thread is always present
5. Verify mixed node types all returned correctly

### Unit tests (board-state.unit.test.ts)

Test service logic with mocked repos:

1. Board not found → throws NotFoundError
2. Chat thread missing → throws InternalError
3. Happy path → returns assembled state

---

## Verification Checklist

- [ ] Migrations 005, 006 run successfully
- [ ] Empty board returns valid state with empty arrays
- [ ] Board with seeded nodes returns only active nodes
- [ ] Soft-deleted nodes/edges are excluded
- [ ] Deleted board returns 404
- [ ] Archived board returns 200 with full state
- [ ] `lastOperationRevision` equals board revision
- [ ] Malformed UUID returns 400
- [ ] Chat thread always present in response
- [ ] Response shape matches OpenAPI `GetBoardStateResponse`
- [ ] No mutations, revision changes, or operation writes occur
