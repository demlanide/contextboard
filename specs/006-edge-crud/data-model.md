# Data Model: Edge CRUD

**Feature Branch**: `006-edge-crud`
**Date**: 2026-03-16

## Entities

### Edge (board_edges)

The `board_edges` table already exists (migration `006_create_board_edges.sql`). No new migrations are required.

#### Fields

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| id | uuid | NOT NULL | — | Primary key |
| board_id | uuid | NOT NULL | — | FK → boards(id) ON DELETE CASCADE |
| source_node_id | uuid | NOT NULL | — | FK → board_nodes(id) ON DELETE CASCADE; immutable after creation |
| target_node_id | uuid | NOT NULL | — | FK → board_nodes(id) ON DELETE CASCADE; immutable after creation |
| label | text | NULL | — | Optional label; max 1,000 characters (enforced at app level) |
| style | jsonb | NOT NULL | '{}' | Visual style properties; freeform in MVP |
| metadata | jsonb | NOT NULL | '{}' | Arbitrary metadata; freeform in MVP |
| deleted_at | timestamptz | NULL | — | Soft-delete marker; NULL = active |
| created_at | timestamptz | NOT NULL | now() | Immutable creation timestamp |
| updated_at | timestamptz | NOT NULL | now() | Updated on every mutation |

#### Constraints

| Constraint | Type | Definition |
|------------|------|------------|
| board_edges_pkey | PRIMARY KEY | (id) |
| board_edges_board_id_fkey | FOREIGN KEY | board_id → boards(id) ON DELETE CASCADE |
| board_edges_source_node_id_fkey | FOREIGN KEY | source_node_id → board_nodes(id) ON DELETE CASCADE |
| board_edges_target_node_id_fkey | FOREIGN KEY | target_node_id → board_nodes(id) ON DELETE CASCADE |
| board_edges_no_self_loop_check | CHECK | source_node_id <> target_node_id |

#### Indexes

| Index | Columns | Type | Notes |
|-------|---------|------|-------|
| idx_board_edges_board_id | board_id | btree | Board lookup for hydration |
| idx_board_edges_source_node_id | source_node_id | btree | Source-node edge lookup |
| idx_board_edges_target_node_id | target_node_id | btree | Target-node edge lookup |
| idx_board_edges_not_deleted | board_id WHERE deleted_at IS NULL | partial btree | Efficient active-edge queries |

#### Relationships

- **Board**: Many edges belong to one board (board_id).
- **Source Node**: Each edge references exactly one source node (source_node_id). A node can be the source of many edges.
- **Target Node**: Each edge references exactly one target node (target_node_id). A node can be the target of many edges.
- **Operations**: Edge mutations produce operation log entries in `board_operations` with target_type='edge'.

### Operation Payloads (board_operations.payload)

Operation types and payloads already exist in `operation-factory.ts`. No changes needed.

#### create_edge

```json
{
  "edge": {
    "id": "uuid",
    "sourceNodeId": "uuid",
    "targetNodeId": "uuid",
    "label": "string | null"
  }
}
```

#### update_edge

```json
{
  "changes": { "label": "new label" },
  "previous": { "label": "old label" }
}
```

#### delete_edge

```json
{
  "edgeId": "uuid",
  "previousState": {
    "sourceNodeId": "uuid",
    "targetNodeId": "uuid",
    "label": "string | null"
  }
}
```

## Validation Rules

### Create Edge

| Layer | Rule | Error |
|-------|------|-------|
| Request | sourceNodeId and targetNodeId are required UUIDs | 422 VALIDATION_ERROR |
| Request | label (if provided) ≤ 1,000 characters | 422 VALIDATION_ERROR |
| Domain | Board exists and is not deleted | 404 BOARD_NOT_FOUND |
| Domain | Board status is 'active' (not archived) | 422 VALIDATION_ERROR |
| Domain | Source node exists | 422 INVALID_EDGE_REFERENCE |
| Domain | Target node exists | 422 INVALID_EDGE_REFERENCE |
| Domain | Source node is active (deleted_at IS NULL) | 422 INVALID_EDGE_REFERENCE |
| Domain | Target node is active (deleted_at IS NULL) | 422 INVALID_EDGE_REFERENCE |
| Domain | Source and target belong to the same board as the route boardId | 422 INVALID_EDGE_REFERENCE |
| DB | source_node_id <> target_node_id (CHECK constraint) | 422 VALIDATION_ERROR |

### Update Edge

| Layer | Rule | Error |
|-------|------|-------|
| Request | Only label, style, metadata fields accepted | 422 VALIDATION_ERROR |
| Request | label (if provided) ≤ 1,000 characters | 422 VALIDATION_ERROR |
| Domain | Edge exists and is active | 404 EDGE_NOT_FOUND |
| Domain | Board exists and is editable | 404/422 |

### Delete Edge

| Layer | Rule | Error |
|-------|------|-------|
| Request | edgeId is a valid UUID | 422 VALIDATION_ERROR |
| Domain | Edge exists and is active | 404 EDGE_NOT_FOUND |
| Domain | Board exists and is editable | 404/422 |

## State Transitions

```
[not exists] --create--> [active]
[active]     --update--> [active] (label/style/metadata changed, updated_at bumped)
[active]     --delete--> [soft-deleted] (deleted_at set)
[active]     --node cascade delete--> [soft-deleted] (via softDeleteByNodeId)
```

Soft-deleted edges are excluded from:
- Board state hydration queries
- Normal API responses
- Frontend store

Soft-deleted edges are NOT valid targets for update or delete operations.

## Frontend State Shape

Edges are stored in the Zustand normalized store (already established in 004/005):

```typescript
interface BoardStore {
  edgesById: Record<string, BoardEdge>;
  edgeOrder: string[];
  // ... existing fields
}

interface BoardEdge {
  id: string;
  boardId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

Edge positions are derived from their source and target node positions at render time — not stored on the edge entity.
