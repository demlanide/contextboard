# Data Model: Board Foundation

**Feature**: 001-board-foundation | **Date**: 2026-03-16
**Source**: `documentation/data-model.md`, `documentation/openapi.yaml`,
`specs/001-board-foundation/spec.md`

This document defines the subset of the data model that this feature
slice implements, including DDL, field rules, state transitions, and
operation log semantics.

---

## Entities in Scope

| Entity | Table | Role in this slice |
|--------|-------|--------------------|
| Board | `boards` | Primary entity: create, read, list, update, delete, archive |
| Chat Thread | `chat_threads` | Auto-created with board; read-only in this slice |
| Board Operation | `board_operations` | Op-log entries for every board mutation |
| Idempotency Key | `idempotency_keys` | Replay protection for POST and PATCH |

Entities **not** in scope: `board_nodes`, `board_edges`, `assets`,
`chat_messages`, `board_snapshots`.

---

## 1. boards

### DDL (Migration 001)

```sql
CREATE TABLE boards (
  id            uuid        PRIMARY KEY,
  title         text        NOT NULL DEFAULT 'Untitled board',
  description   text,
  status        text        NOT NULL DEFAULT 'active',
  viewport_state jsonb      NOT NULL DEFAULT '{}'::jsonb,
  settings      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  summary       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  revision      bigint      NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT boards_status_check
    CHECK (status IN ('active', 'archived', 'deleted'))
);

CREATE INDEX idx_boards_status ON boards(status);
CREATE INDEX idx_boards_updated_at ON boards(updated_at DESC);
```

### Field Rules

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, generated server-side | UUIDv4 |
| title | text | NOT NULL, 1–200 chars | Default: "Untitled board" |
| description | text | nullable, max 10,000 chars | |
| status | text | CHECK (active, archived, deleted) | See state machine |
| viewport_state | jsonb | NOT NULL, default `{}` | `{x, y, zoom}` when set |
| settings | jsonb | NOT NULL, default `{}` | `{gridEnabled, snapToGrid, agentEditMode}` |
| summary | jsonb | NOT NULL, default `{}` | AI-generated, opaque in this slice |
| revision | bigint | NOT NULL, default 0, >= 0 | Sync primitive |
| created_at | timestamptz | NOT NULL, auto | Immutable |
| updated_at | timestamptz | NOT NULL, auto | Updated on every mutation |

### State Machine

```text
         PATCH {status: "archived"}
  active ──────────────────────────► archived
    │                                   │
    │  DELETE                           │ DELETE
    ▼                                   ▼
  deleted                            deleted
```

**Transition rules**:

| From | To | Trigger | Revision | Op-log |
|------|----|---------|----------|--------|
| active | active | PATCH (metadata fields) | +1 | `update_board` |
| active | archived | PATCH `{status: "archived"}` | +1 | `archive_board` |
| active | deleted | DELETE | no change | `delete_board` (at current rev) |
| archived | deleted | DELETE | no change | `delete_board` (at current rev) |
| archived | active | PATCH `{status: "active"}` | REJECTED 422 | — |
| deleted | * | any mutation | REJECTED 404 | — |

### Revision Policy

- **Create**: revision = 0; op-log writes `create_board` at rev 0
- **Metadata update**: revision incremented by 1 in same transaction
- **Archive**: revision incremented by 1 (archived boards remain
  visible sync targets)
- **Delete**: revision NOT incremented (board disappears from all
  read paths; no polling consumer needs the bump)
- One revision bump per committed transaction, regardless of how many
  fields changed in the PATCH

---

## 2. chat_threads

### DDL (Migration 002)

```sql
CREATE TABLE chat_threads (
  id         uuid        PRIMARY KEY,
  board_id   uuid        NOT NULL UNIQUE REFERENCES boards(id) ON DELETE CASCADE,
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Field Rules

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK, generated server-side | UUIDv4 |
| board_id | uuid | NOT NULL, UNIQUE, FK → boards(id) | One thread per board |
| metadata | jsonb | NOT NULL, default `{}` | Reserved for future use |
| created_at | timestamptz | NOT NULL, auto | Immutable |
| updated_at | timestamptz | NOT NULL, auto | |

### Behavior in This Slice

- Auto-created in the same transaction as board creation
- Returned in `CreateBoardResponse.data.chatThread`
- No direct CRUD endpoints in this slice
- CASCADE on board delete removes the chat thread row

---

## 3. board_operations

### DDL (Migration 003)

```sql
CREATE TABLE board_operations (
  id              uuid        PRIMARY KEY,
  board_id        uuid        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  board_revision  bigint      NOT NULL,
  actor_type      text        NOT NULL,
  operation_type  text        NOT NULL,
  target_type     text        NOT NULL,
  target_id       uuid,
  batch_id        uuid,
  payload         jsonb       NOT NULL,
  inverse_payload jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT board_operations_actor_type_check
    CHECK (actor_type IN ('user', 'agent', 'system')),
  CONSTRAINT board_operations_operation_type_check
    CHECK (operation_type IN (
      'create_board', 'update_board', 'delete_board', 'archive_board',
      'create_node', 'update_node', 'delete_node', 'restore_node',
      'create_edge', 'update_edge', 'delete_edge',
      'create_asset', 'apply_agent_action_batch', 'create_snapshot'
    )),
  CONSTRAINT board_operations_target_type_check
    CHECK (target_type IN ('board', 'node', 'edge', 'asset', 'chat',
                           'layout', 'snapshot'))
);

CREATE INDEX idx_board_operations_board_revision
  ON board_operations(board_id, board_revision);
CREATE INDEX idx_board_operations_board_created
  ON board_operations(board_id, created_at);
CREATE INDEX idx_board_operations_batch_id
  ON board_operations(batch_id);
CREATE INDEX idx_board_operations_target
  ON board_operations(target_type, target_id);
```

### Operation Types Used in This Slice

| operation_type | target_type | Trigger | board_revision value |
|----------------|-------------|---------|----------------------|
| `create_board` | board | POST /boards | 0 (initial) |
| `update_board` | board | PATCH /boards/{id} (metadata fields) | post-increment value |
| `archive_board` | board | PATCH /boards/{id} `{status: "archived"}` | post-increment value |
| `delete_board` | board | DELETE /boards/{id} | current (pre-delete) value |

### Payload Shape by Operation

**create_board**:
```json
{
  "title": "My Board",
  "description": null,
  "chatThreadId": "uuid"
}
```

**update_board**:
```json
{
  "changes": { "title": "New Title" },
  "previous": { "title": "Old Title" }
}
```

**archive_board**:
```json
{
  "previousStatus": "active"
}
```

**delete_board**:
```json
{
  "previousStatus": "active"
}
```

---

## 4. idempotency_keys

### DDL (Migration 004)

```sql
CREATE TABLE idempotency_keys (
  id                   uuid        PRIMARY KEY,
  scope_key            text        NOT NULL UNIQUE,
  request_fingerprint  text        NOT NULL,
  response_status_code integer     NOT NULL,
  response_body        jsonb       NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL
);

CREATE INDEX idx_idempotency_keys_expires_at
  ON idempotency_keys(expires_at);
```

### Field Rules

| Field | Type | Notes |
|-------|------|-------|
| scope_key | text | `{operation}:{boardId or global}:{key}` |
| request_fingerprint | text | SHA-256 hex of normalized body |
| response_status_code | integer | Cached HTTP status |
| response_body | jsonb | Cached JSON response |
| expires_at | timestamptz | created_at + 24 hours |

### Behavior

- On first request with key: execute normally, cache response
- On replay with matching fingerprint: return cached response
- On replay with different fingerprint: return 409
  `IDEMPOTENCY_CONFLICT`
- Expired keys are eligible for async cleanup (not in critical path)

---

## Migration Order

| # | File | Dependencies |
|---|------|-------------|
| 001 | `001_create_boards.sql` | None |
| 002 | `002_create_chat_threads.sql` | boards |
| 003 | `003_create_board_operations.sql` | boards |
| 004 | `004_create_idempotency_keys.sql` | None |

All four migrations are executed in this slice. The `board_operations`
migration includes the extended `operation_type` CHECK constraint
(R-001 from research.md).
