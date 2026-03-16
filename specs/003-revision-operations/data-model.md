# Data Model: Revision + Operations Foundation

**Feature**: 003-revision-operations | **Date**: 2026-03-16
**Source**: `documentation/data-model.md`, `specs/003-revision-operations/spec.md`,
`specs/001-board-foundation/data-model.md`

This document defines the data model changes for this feature slice.
S3 is primarily a refactoring slice: it corrects the operation_type
enum, generalizes the operation factory, and adds per-board write
serialization. No new tables are created.

---

## Entities in Scope

| Entity | Table | Role in this slice |
|--------|-------|--------------------|
| Board Operation | `board_operations` | Refactor: narrow CHECK constraint, standardize payload shapes |
| Board | `boards` | Affected: advisory lock for write serialization |
| Idempotency Key | `idempotency_keys` | Existing: no schema change; idempotency behavior verified |

Entities **not** in scope for schema changes: `board_nodes`,
`board_edges`, `chat_threads`.

---

## 1. board_operations — CHECK Constraint Update

### Migration 007: Narrow operation_type CHECK

The S1 migration (003) included `create_board`, `delete_board`, and
`archive_board` in the `operation_type` CHECK. Per S3 clarifications:

- Board creation does NOT write an operation (revision 0 = genesis)
- Board soft-delete uses `update_board` (payload: before/after status)
- Board archival uses `update_board` (payload: before/after status)

```sql
-- 007_narrow_operation_type.sql

ALTER TABLE board_operations
  DROP CONSTRAINT board_operations_operation_type_check;

ALTER TABLE board_operations
  ADD CONSTRAINT board_operations_operation_type_check
    CHECK (operation_type IN (
      'update_board',
      'create_node', 'update_node', 'delete_node', 'restore_node',
      'create_edge', 'update_edge', 'delete_edge',
      'create_asset', 'apply_agent_action_batch', 'create_snapshot'
    ));
```

**Pre-migration requirement**: Any existing `create_board`,
`delete_board`, or `archive_board` rows in `board_operations` must be
updated to `update_board` before running this migration. In practice,
only test/dev data exists; a data fixup query is included:

```sql
UPDATE board_operations
SET operation_type = 'update_board'
WHERE operation_type IN ('create_board', 'delete_board', 'archive_board');
```

### Existing DDL (unchanged)

All other constraints, indexes, and columns from migration 003 remain
unchanged. The table schema is:

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| board_id | uuid | NOT NULL, FK → boards(id) CASCADE |
| board_revision | bigint | NOT NULL |
| actor_type | text | CHECK (user, agent, system) |
| operation_type | text | CHECK (updated — see above) |
| target_type | text | CHECK (board, node, edge, asset, chat, layout, snapshot) |
| target_id | uuid | nullable |
| batch_id | uuid | nullable |
| payload | jsonb | NOT NULL |
| inverse_payload | jsonb | nullable |
| created_at | timestamptz | NOT NULL, default now() |

---

## 2. Operation Payload Shapes

S3 defines the canonical payload shape for each operation type that
the factory must enforce. These are TypeScript interfaces, not DB
constraints — the DB column remains `jsonb`.

### update_board — Metadata Update

```typescript
interface UpdateBoardPayload {
  changes: Record<string, unknown>;
  previous: Record<string, unknown>;
}
```

### update_board — Status Transition (Archive, Soft-Delete)

```typescript
interface UpdateBoardStatusPayload {
  before: { status: string };
  after: { status: string };
}
```

### create_node (future S4)

```typescript
interface CreateNodePayload {
  node: {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    content: Record<string, unknown>;
    style: Record<string, unknown>;
  };
}
```

### update_node (future S4)

```typescript
interface UpdateNodePayload {
  changes: Record<string, unknown>;
  previous: Record<string, unknown>;
}
```

### delete_node (future S4)

```typescript
interface DeleteNodePayload {
  nodeId: string;
  previousState: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    content: Record<string, unknown>;
  };
}
```

### create_edge (future S5)

```typescript
interface CreateEdgePayload {
  edge: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    label: string | null;
  };
}
```

### update_edge (future S5)

```typescript
interface UpdateEdgePayload {
  changes: Record<string, unknown>;
  previous: Record<string, unknown>;
}
```

### delete_edge (future S5)

```typescript
interface DeleteEdgePayload {
  edgeId: string;
  previousState: {
    sourceNodeId: string;
    targetNodeId: string;
    label: string | null;
  };
}
```

---

## 3. Advisory Lock for Per-Board Write Serialization

No schema change. PostgreSQL advisory locks are used:

```sql
SELECT pg_advisory_xact_lock(hashtext($1::text));
```

where `$1` is the board UUID. `hashtext` converts the UUID string to
a `bigint` suitable for advisory locking. The lock is automatically
released when the transaction commits or rolls back.

**Characteristics**:
- Transaction-scoped (no leak risk)
- Does not block reads (advisory locks are separate from row locks)
- Serializes concurrent mutations to the same board
- Different boards are fully independent

---

## 4. Revision Policy (Unchanged)

The revision policy from S1 remains correct:

| Mutation | Revision behavior |
|----------|-------------------|
| Board creation | revision = 0 (DDL default) |
| Metadata update | revision + 1 |
| Archive (active → archived) | revision + 1 |
| Soft-delete | No bump |
| Future node/edge CRUD | revision + 1 (per batch, not per entity) |

---

## 5. Idempotency (No Schema Change)

The `idempotency_keys` table and middleware remain unchanged. S3
verifies that the existing behavior satisfies FR-017 through FR-022.

The scope key format remains:
`{operation}:{boardId|global}:{idempotencyKey}`

---

## Migration Order (Cumulative)

| # | File | Dependencies | Created by |
|---|------|-------------|------------|
| 001 | `001_create_boards.sql` | None | S1 |
| 002 | `002_create_chat_threads.sql` | boards | S1 |
| 003 | `003_create_board_operations.sql` | boards | S1 |
| 004 | `004_create_idempotency_keys.sql` | None | S1 |
| 005 | `005_create_board_nodes.sql` | boards | S2 |
| 006 | `006_create_board_edges.sql` | boards, board_nodes | S2 |
| 007 | `007_narrow_operation_type.sql` | board_operations | **S3 (this slice)** |
