# Internal Contract: Mutation Infrastructure

**Feature**: 003-revision-operations | **Date**: 2026-03-16
**Source**: `specs/003-revision-operations/spec.md`,
`specs/003-revision-operations/research.md`

This feature slice does not introduce new HTTP endpoints. The
"contracts" are internal service-layer interfaces that all current and
future mutation flows must use. This document defines the three core
infrastructure components: the board mutation wrapper, the generalized
operation factory, and the advisory lock helper.

---

## 1. withBoardMutation — Transaction Wrapper

Every service method that performs a durable board mutation MUST use
`withBoardMutation` instead of raw `withTransaction`.

### Signature

```typescript
interface BoardMutationContext {
  client: PoolClient;
  board: Board;
}

interface BoardMutationResult<T> {
  result: T;
  operations: OperationEntry[];
  /** New revision after bump. Null if mutation does not bump revision (e.g., soft-delete). */
  newRevision: number | null;
}

function withBoardMutation<T>(
  boardId: string,
  fn: (ctx: BoardMutationContext) => Promise<BoardMutationResult<T>>
): Promise<T>;
```

### Behavior

1. Acquires a database client from the pool and starts a transaction.
2. Acquires a per-board advisory lock via `acquireBoardLock(client, boardId)`.
3. Loads the board row and validates it exists (throws `BOARD_NOT_FOUND` if missing/deleted).
4. Calls the mutation callback `fn` with `{ client, board }`.
5. If `newRevision` is not null, updates `boards.revision` and `boards.updated_at`.
6. Inserts all returned `operations` via `insertOperation`.
7. Commits the transaction.
8. On any error, rolls back and rethrows.

### Invariants Enforced

- Advisory lock serializes concurrent writes to the same board
- Board existence and deletion checks happen inside the lock
- Revision bump happens after all entity writes, before commit
- Operations are written in the same transaction as state changes
- If the callback throws, nothing is committed

### Usage Example (board title update)

```typescript
export async function updateBoard(boardId: string, patch: UpdateBoardRequest): Promise<Board> {
  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    const newRevision = getNextRevision(board.revision, 'update');
    const { changes, previous } = computeChanges(board, patch);
    const updated = await updateBoardRepo(client, boardId, { ...changes, revision: newRevision });

    const op = buildOperation({
      boardId,
      boardRevision: newRevision,
      actorType: 'user',
      operationType: 'update_board',
      targetType: 'board',
      targetId: boardId,
      payload: { changes, previous },
    });

    return { result: updated!, operations: [op], newRevision };
  });
}
```

### Usage Example (board soft-delete — no revision bump)

```typescript
export async function deleteBoard(boardId: string): Promise<{ success: true; boardId: string }> {
  return withBoardMutation(boardId, async ({ client, board }) => {
    await updateBoardRepo(client, boardId, { status: 'deleted' });

    const op = buildOperation({
      boardId,
      boardRevision: board.revision,
      actorType: 'user',
      operationType: 'update_board',
      targetType: 'board',
      targetId: boardId,
      payload: { before: { status: board.status }, after: { status: 'deleted' } },
    });

    return { result: { success: true, boardId }, operations: [op], newRevision: null };
  });
}
```

---

## 2. buildOperation — Generalized Operation Factory

Replaces the S1 per-operation-type factory functions with a single
generalized builder.

### Signature

```typescript
interface BuildOperationParams {
  boardId: string;
  boardRevision: number;
  actorType: ActorType;
  operationType: OperationType;
  targetType: TargetType;
  targetId?: string | null;
  batchId?: string | null;
  payload: Record<string, unknown>;
  inversePayload?: Record<string, unknown> | null;
}

function buildOperation(params: BuildOperationParams): OperationEntry;
```

### Behavior

- Generates a UUID for the operation `id`
- Defaults `targetId` and `batchId` to null if not provided
- Defaults `inversePayload` to null if not provided
- Returns a fully-formed `OperationEntry` ready for `insertOperation`

### OperationType (Updated)

```typescript
type OperationType =
  | 'update_board'
  | 'create_node'
  | 'update_node'
  | 'delete_node'
  | 'restore_node'
  | 'create_edge'
  | 'update_edge'
  | 'delete_edge'
  | 'create_asset'
  | 'apply_agent_action_batch'
  | 'create_snapshot';
```

Removed from S1: `create_board`, `delete_board`, `archive_board`.

### ActorType / TargetType (Unchanged)

```typescript
type ActorType = 'user' | 'agent' | 'system';
type TargetType = 'board' | 'node' | 'edge' | 'asset' | 'chat' | 'layout' | 'snapshot';
```

### Backward Compatibility

Convenience wrappers for S1's `updateBoardOperation` pattern are
retained as thin wrappers around `buildOperation` to minimize churn
in existing service code. The wrappers for `archiveBoardOperation` and
`deleteBoardOperation` are replaced with direct `buildOperation` calls
using `update_board` operation type and status before/after payload.

---

## 3. acquireBoardLock — Advisory Lock Helper

### Signature

```typescript
function acquireBoardLock(client: PoolClient, boardId: string): Promise<void>;
```

### Behavior

Executes `SELECT pg_advisory_xact_lock(hashtext($1))` with the board
UUID. The lock is:

- Scoped to the current transaction (released on commit/rollback)
- Blocking for concurrent transactions targeting the same board
- Non-blocking for reads and for mutations targeting other boards

### Error Handling

If the query fails (e.g., connection issue), the error propagates and
the transaction rolls back.

---

## 4. Board Creation — No Operation Written

Per S3 clarification, `createBoard` in `boards.service.ts` MUST NOT
write an operation log entry. The current S1 code calls
`createBoardOperation(boardId, 0, ...)` — this call is removed. Board
creation does not use `withBoardMutation` because there is no existing
board to lock or validate.

---

## 5. Existing Behavior Changes Summary

| Service method | Before (S1) | After (S3) |
|---------------|-------------|------------|
| `createBoard` | Writes `create_board` operation | No operation written |
| `updateBoard` (metadata) | Uses `updateBoardOperation` | Uses `buildOperation` with `update_board` |
| `updateBoard` (archive) | Uses `archiveBoardOperation` | Uses `buildOperation` with `update_board` + status payload |
| `deleteBoard` | Uses `deleteBoardOperation` | Uses `buildOperation` with `update_board` + status payload |
| All mutations | No board lock | Advisory lock via `withBoardMutation` |

---

## 6. Test Contract

The following invariants MUST be verified by tests:

1. Board creation produces no operation rows
2. Metadata update produces exactly one `update_board` operation
3. Archive produces exactly one `update_board` operation with before/after status
4. Soft-delete produces exactly one `update_board` operation with before/after status
5. Revision bumps exactly once per mutation batch
6. Revision does not bump on soft-delete
7. Concurrent mutations to the same board serialize (no revision gaps)
8. Failed mutations produce no operations and no revision change
9. Idempotent replay returns cached response without new operations
10. Idempotent key mismatch returns 409
