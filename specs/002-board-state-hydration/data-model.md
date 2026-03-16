# Data Model: Board State Hydration

**Feature**: 002-board-state-hydration | **Date**: 2026-03-16
**Source**: `documentation/data-model.md`, `documentation/openapi.yaml`,
`specs/002-board-state-hydration/spec.md`

This document defines the data model subset that this feature slice
depends on for hydration reads, plus the new table migrations this slice
introduces as read-side prerequisites.

---

## Entities in Scope

| Entity | Table | Role in this slice |
|--------|-------|--------------------|
| Board | `boards` | Read: fetch board metadata, check status |
| Board Node | `board_nodes` | Read: fetch active nodes for hydration |
| Board Edge | `board_edges` | Read: fetch active edges for hydration |
| Chat Thread | `chat_threads` | Read: fetch thread metadata for hydration |

Entities **not** in scope for mutations: this slice performs no writes.
All entities are read-only in the context of this feature.

Tables created by prior slices: `boards`, `chat_threads`,
`board_operations`, `idempotency_keys` (all from S1).

Tables created by this slice: `board_nodes`, `board_edges`.

---

## 1. board_nodes (NEW — Migration 005)

### DDL

```sql
CREATE TABLE board_nodes (
  id         uuid           PRIMARY KEY,
  board_id   uuid           NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  type       text           NOT NULL,
  parent_id  uuid           REFERENCES board_nodes(id) ON DELETE SET NULL,

  x          double precision NOT NULL DEFAULT 0,
  y          double precision NOT NULL DEFAULT 0,
  width      double precision NOT NULL DEFAULT 200,
  height     double precision NOT NULL DEFAULT 120,
  rotation   double precision NOT NULL DEFAULT 0,
  z_index    integer        NOT NULL DEFAULT 0,

  content    jsonb          NOT NULL DEFAULT '{}'::jsonb,
  style      jsonb          NOT NULL DEFAULT '{}'::jsonb,
  metadata   jsonb          NOT NULL DEFAULT '{}'::jsonb,

  locked     boolean        NOT NULL DEFAULT false,
  hidden     boolean        NOT NULL DEFAULT false,
  deleted_at timestamptz,

  created_at timestamptz    NOT NULL DEFAULT now(),
  updated_at timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT board_nodes_type_check
    CHECK (type IN ('sticky', 'text', 'image', 'shape')),
  CONSTRAINT board_nodes_width_check
    CHECK (width > 0 AND width <= 10000),
  CONSTRAINT board_nodes_height_check
    CHECK (height > 0 AND height <= 10000)
);

CREATE INDEX idx_board_nodes_board_id
  ON board_nodes(board_id);
CREATE INDEX idx_board_nodes_parent_id
  ON board_nodes(parent_id);
CREATE INDEX idx_board_nodes_board_z
  ON board_nodes(board_id, z_index);
CREATE INDEX idx_board_nodes_not_deleted
  ON board_nodes(board_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_board_nodes_type
  ON board_nodes(board_id, type);
CREATE INDEX idx_board_nodes_content_gin
  ON board_nodes USING gin (content);
CREATE INDEX idx_board_nodes_metadata_gin
  ON board_nodes USING gin (metadata);
```

### Field Rules

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | UUIDv4, generated server-side |
| board_id | uuid | NOT NULL, FK → boards(id) | CASCADE on board delete |
| type | text | CHECK (sticky, text, image, shape) | Immutable after creation |
| parent_id | uuid | nullable, FK → board_nodes(id) | SET NULL on parent delete |
| x, y | double | NOT NULL, default 0 | Canvas position |
| width, height | double | NOT NULL, > 0, ≤ 10000 | Canvas dimensions |
| rotation | double | NOT NULL, default 0 | Degrees |
| z_index | integer | NOT NULL, default 0 | Render ordering |
| content | jsonb | NOT NULL, default `{}` | Type-specific content |
| style | jsonb | NOT NULL, default `{}` | Visual styling |
| metadata | jsonb | NOT NULL, default `{}` | App/machine metadata |
| locked | boolean | NOT NULL, default false | Mutation lock |
| hidden | boolean | NOT NULL, default false | UI visibility hint |
| deleted_at | timestamptz | nullable | Soft-delete marker |
| created_at | timestamptz | NOT NULL, auto | Immutable |
| updated_at | timestamptz | NOT NULL, auto | Updated on mutation |

### Hydration Query

```sql
SELECT * FROM board_nodes
WHERE board_id = $1 AND deleted_at IS NULL
ORDER BY z_index ASC, created_at ASC;
```

Uses partial index `idx_board_nodes_not_deleted` for efficient filtering.

---

## 2. board_edges (NEW — Migration 006)

### DDL

```sql
CREATE TABLE board_edges (
  id              uuid        PRIMARY KEY,
  board_id        uuid        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  source_node_id  uuid        NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
  target_node_id  uuid        NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,

  label      text,
  style      jsonb          NOT NULL DEFAULT '{}'::jsonb,
  metadata   jsonb          NOT NULL DEFAULT '{}'::jsonb,

  deleted_at timestamptz,
  created_at timestamptz    NOT NULL DEFAULT now(),
  updated_at timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT board_edges_no_self_loop_check
    CHECK (source_node_id <> target_node_id)
);

CREATE INDEX idx_board_edges_board_id
  ON board_edges(board_id);
CREATE INDEX idx_board_edges_source_node_id
  ON board_edges(source_node_id);
CREATE INDEX idx_board_edges_target_node_id
  ON board_edges(target_node_id);
CREATE INDEX idx_board_edges_not_deleted
  ON board_edges(board_id) WHERE deleted_at IS NULL;
```

### Field Rules

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | uuid | PK | UUIDv4 |
| board_id | uuid | NOT NULL, FK → boards(id) | CASCADE on board delete |
| source_node_id | uuid | NOT NULL, FK → board_nodes(id) | CASCADE on node delete |
| target_node_id | uuid | NOT NULL, FK → board_nodes(id) | CASCADE on node delete |
| label | text | nullable | Edge label text |
| style | jsonb | NOT NULL, default `{}` | Visual styling |
| metadata | jsonb | NOT NULL, default `{}` | App metadata |
| deleted_at | timestamptz | nullable | Soft-delete marker |
| created_at | timestamptz | NOT NULL, auto | Immutable |
| updated_at | timestamptz | NOT NULL, auto | Updated on mutation |

### Hydration Query

```sql
SELECT * FROM board_edges
WHERE board_id = $1 AND deleted_at IS NULL
ORDER BY created_at ASC;
```

Uses partial index `idx_board_edges_not_deleted` for efficient filtering.

---

## 3. Existing Tables (Read-Only in This Slice)

### boards (from S1)

Hydration query:

```sql
SELECT * FROM boards WHERE id = $1 AND status <> 'deleted';
```

If no row is returned, the endpoint returns 404 BOARD_NOT_FOUND.

### chat_threads (from S1)

Hydration query:

```sql
SELECT * FROM chat_threads WHERE board_id = $1;
```

If no row is returned for a valid board, the endpoint returns 500
INTERNAL_ERROR (data integrity failure — S1 guarantees one thread per
board).

---

## Migration Order

| # | File | Dependencies | Created by |
|---|------|-------------|------------|
| 001 | `001_create_boards.sql` | None | S1 |
| 002 | `002_create_chat_threads.sql` | boards | S1 |
| 003 | `003_create_board_operations.sql` | boards | S1 |
| 004 | `004_create_idempotency_keys.sql` | None | S1 |
| 005 | `005_create_board_nodes.sql` | boards | **S2 (this slice)** |
| 006 | `006_create_board_edges.sql` | boards, board_nodes | **S2 (this slice)** |

---

## Response Shape (API Contract)

The hydration service assembles the response from four queries into the
`GetBoardStateResponse` envelope:

```json
{
  "data": {
    "board": { /* full Board schema */ },
    "nodes": [ /* array of Node objects, camelCase */ ],
    "edges": [ /* array of Edge objects, camelCase */ ],
    "chatThread": { /* full ChatThread schema */ },
    "lastOperationRevision": 0
  },
  "error": null
}
```

`lastOperationRevision` is sourced directly from `boards.revision`.

### Row-to-API Field Mapping

| DB Column | API Field |
|-----------|-----------|
| board_id | boardId |
| source_node_id | sourceNodeId |
| target_node_id | targetNodeId |
| parent_id | parentId |
| z_index | zIndex |
| created_at | createdAt |
| updated_at | updatedAt |
| deleted_at | (filtered out; never in response) |
