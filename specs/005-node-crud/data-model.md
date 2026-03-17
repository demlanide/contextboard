# Data Model: Node CRUD

**Feature**: `005-node-crud` | **Date**: 2026-03-16

## Overview

This slice does not introduce new database tables — `board_nodes`, `board_edges`, and `board_operations` already exist from prior migrations (005, 006, 007). This document defines the entities, field shapes, validation rules, and state transitions that the Node CRUD implementation must enforce.

## Entities

### board_nodes (existing table — no migration needed)

The `board_nodes` table was created in migration `005_create_board_nodes.sql` and is already used by the board-state hydration read path (S2). This slice adds write operations against it.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK | Server-assigned on create |
| `board_id` | uuid | NOT NULL, FK → boards(id) ON DELETE CASCADE | Immutable after create |
| `type` | text | NOT NULL, CHECK IN ('sticky','text','image','shape') | Immutable after create |
| `parent_id` | uuid | FK → board_nodes(id) ON DELETE SET NULL, nullable | Future grouping; nullable |
| `x` | double precision | NOT NULL, DEFAULT 0 | Canvas x coordinate |
| `y` | double precision | NOT NULL, DEFAULT 0 | Canvas y coordinate |
| `width` | double precision | NOT NULL, DEFAULT 200, CHECK (> 0 AND ≤ 10000) | |
| `height` | double precision | NOT NULL, DEFAULT 120, CHECK (> 0 AND ≤ 10000) | |
| `rotation` | double precision | NOT NULL, DEFAULT 0 | Degrees |
| `z_index` | integer | NOT NULL, DEFAULT 0 | Layering order |
| `content` | jsonb | NOT NULL, DEFAULT '{}' | Type-specific; see Content Shapes |
| `style` | jsonb | NOT NULL, DEFAULT '{}' | See Style Shape |
| `metadata` | jsonb | NOT NULL, DEFAULT '{}' | Freeform |
| `locked` | boolean | NOT NULL, DEFAULT false | Prevents mutation when true |
| `hidden` | boolean | NOT NULL, DEFAULT false | Excluded from canvas render |
| `deleted_at` | timestamptz | nullable | Soft-delete marker |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Updated on every write |

### board_edges (existing table — cascade writes only)

This slice does not add edge CRUD endpoints. The only edge write is cascade soft-delete when a node is deleted: set `deleted_at = now()` on all active edges where `source_node_id` or `target_node_id` matches the deleted node.

### board_operations (existing table — new operation entries)

Node mutations write operation log entries via `buildOperation`:

| Operation | `operation_type` | `target_type` | `target_id` | Payload |
|-----------|-----------------|---------------|-------------|---------|
| Create node | `create_node` | `node` | new node ID | `CreateNodePayload` |
| Update node | `update_node` | `node` | node ID | `UpdateNodePayload` |
| Delete node | `delete_node` | `node` | node ID | `DeleteNodePayload` |
| Cascade edge delete | `delete_edge` | `edge` | edge ID | `DeleteEdgePayload` |

All operations in a single mutation share the same `board_revision`.

## Content Shapes (JSONB)

Content validation is per-node-type and enforced at the domain layer before insert/update.

### Sticky content

```typescript
{
  text: string     // required, 1–20,000 characters
}
```

### Text content

```typescript
{
  text: string     // required, 1–20,000 characters
  title?: string   // optional, max 500 characters
}
```

### Shape content

```typescript
{
  shapeType: 'rectangle' | 'ellipse' | 'diamond'  // required
  text?: string    // optional, max 5,000 characters
}
```

### Image content (API-level only; frontend flow deferred to S8)

```typescript
{
  assetId: string  // required, UUID referencing assets table
}
```

## Style Shape (JSONB)

Style is a freeform object. The following fields are recognized by the frontend renderer; additional fields are preserved but ignored.

```typescript
{
  backgroundColor?: string   // CSS color
  textColor?: string         // CSS color
  borderColor?: string       // CSS color
  borderWidth?: number       // px
  fontSize?: number          // px
  fontWeight?: string        // e.g., 'bold', 'normal'
  opacity?: number           // 0–1
}
```

## Metadata Shape (JSONB)

Freeform. No validation beyond JSON validity. Used for:
- Future tags, labels, annotations
- Agent-produced context
- Extension data

## Validation Rules

### Create Node

| Layer | Rule |
|-------|------|
| Request | `type`, `x`, `y`, `width`, `height`, `content` required |
| Request | `type` ∈ {sticky, text, image, shape} |
| Request | `width` > 0, `width` ≤ 10,000; `height` > 0, `height` ≤ 10,000 |
| Domain | Board exists and is not null |
| Domain | Board status is `active` (not archived, not deleted) |
| Domain | Content valid for declared type (see Content Shapes) |
| Domain | Text length ≤ 20,000 for sticky/text; ≤ 5,000 for shape text |
| Domain | Shape `shapeType` ∈ {rectangle, ellipse, diamond} |
| Domain | Image `assetId` is valid UUID (full asset validation deferred to S8) |

### Update Node (PATCH)

| Layer | Rule |
|-------|------|
| Request | Content-Type is `application/merge-patch+json` |
| Request | Body is valid partial object; only allowed fields present |
| Request | If `width`/`height` present: > 0, ≤ 10,000 |
| Domain | Node exists and `deleted_at` IS NULL |
| Domain | Board status is `active` |
| Domain | Node is not locked (`locked = false`) |
| Domain | After applying merge-patch, content remains valid for node type |
| Domain | After applying merge-patch, text lengths remain within limits |

### Delete Node

| Layer | Rule |
|-------|------|
| Domain | Node exists and `deleted_at` IS NULL |
| Domain | Board status is `active` |
| Domain | Node is not locked (`locked = false`) |
| Transaction | Set `deleted_at = now()` on node |
| Transaction | Set `deleted_at = now()` on all active edges where node is source or target |
| Transaction | Write `delete_node` + `delete_edge` operations |
| Transaction | Bump board revision once |

## State Transitions

### Node lifecycle

```
[not exists] --create--> [active]
[active] --update--> [active]
[active] --delete--> [soft-deleted]
```

Locked nodes reject update and delete transitions. Soft-deleted nodes are excluded from all queries and are not valid mutation targets.

### Board editability guard

All node mutations check board status before proceeding:

```
board.status == 'active'  → allow mutation
board.status == 'archived' → reject with 409
board.status == 'deleted'  → reject with 404
```

## Merge-Patch Semantics (for PATCH /nodes/{nodeId})

Per RFC 7396 and OpenAPI contract:

- **Scalar fields** (x, y, width, height, rotation, zIndex, locked, hidden): Value in patch overwrites.
- **Object fields** (content, style, metadata): Recursive merge — keys present in patch overwrite or add; keys set to `null` remove; keys absent are preserved.
- **Array fields** (if any exist in content/style/metadata): Entire array replaces (no element-level merge).
- **`null` value**: Removes the key from the target object.
- **Absent key**: No change to that field.

The merge-patch utility applies this recursively to JSONB fields, then domain validation runs on the merged result.

## Frontend State Model

### Zustand store additions

```typescript
interface BoardStoreState {
  // ... existing fields ...

  // Node confirmed state (from server)
  nodesById: Record<string, Node>;

  // Optimistic overlay
  pendingNodes: Record<string, PendingNode>;

  // UI state
  selectedNodeIds: Set<string>;
  placementMode: NodeType | null;      // active when toolbar type selected
  editingNodeId: string | null;        // active during inline text edit
  deletePendingNodeId: string | null;  // active during undo toast window
}

interface PendingNode {
  tempId: string;
  node: Partial<Node>;
  status: 'pending' | 'failed';
  error?: string;
}
```

### Reconciliation flow

1. **Optimistic update**: Store applies change locally (add/modify/remove node in `nodesById` or `pendingNodes`).
2. **API call**: Request sent to backend.
3. **Success**: Replace local state with server response. Remove from `pendingNodes` if applicable. Update board revision.
4. **Failure**: Roll back to last confirmed state. Show error indicator. For create: remove from `pendingNodes`. For move/resize: revert to confirmed position/dimensions.
