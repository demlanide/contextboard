# Data Model: Assets and Image Nodes

**Branch**: `008-assets-image-nodes` | **Date**: 2026-03-16

## Entities

### assets

Uploaded files with durable metadata. Primary use case in MVP: images backing image nodes.

#### Fields

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NOT NULL | — | Primary key |
| board_id | uuid | NULL | — | FK → boards(id) ON DELETE SET NULL. Required at upload in MVP but nullable at DB level for future flexibility. |
| kind | text | NOT NULL | — | `'image'` or `'file'`. CHECK constraint. |
| mime_type | text | NULL | — | Detected MIME type after magic-byte sniffing (e.g., `image/png`). |
| original_filename | text | NULL | — | Client-provided filename stored as metadata only. Never used for storage paths. |
| storage_key | text | NOT NULL | — | UNIQUE. Backend-generated key for blob storage lookup. Format: `{boardId}/{assetId}/{sanitized-name}`. |
| thumbnail_storage_key | text | NULL | — | Storage key for the generated thumbnail. NULL if no thumbnail generated (e.g., non-image file). |
| file_size_bytes | bigint | NULL | — | Size of the original file in bytes. |
| width | integer | NULL | — | Native image width in pixels. NULL for non-image files. |
| height | integer | NULL | — | Native image height in pixels. NULL for non-image files. |
| processing_status | text | NOT NULL | `'ready'` | `'pending'`, `'processing'`, `'ready'`, `'failed'`. CHECK constraint. MVP uploads always return `'ready'`. |
| extracted_text | text | NULL | — | Reserved for future OCR. Not populated in MVP. |
| ai_caption | text | NULL | — | Reserved for future captioning. Not populated in MVP. |
| metadata | jsonb | NOT NULL | `'{}'` | Extensible metadata object. |
| created_at | timestamptz | NOT NULL | `now()` | |
| updated_at | timestamptz | NOT NULL | `now()` | |

#### Indexes

| Name | Definition | Purpose |
|------|-----------|---------|
| idx_assets_board_id | `ON assets(board_id)` | Board-scoped asset lookups |
| idx_assets_kind | `ON assets(kind)` | Filter by asset type |
| idx_assets_processing_status | `ON assets(processing_status)` | Filter by processing state |

#### Constraints

| Name | Definition |
|------|-----------|
| assets_kind_check | `CHECK (kind IN ('image', 'file'))` |
| assets_processing_status_check | `CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'))` |
| assets_storage_key_unique | `UNIQUE (storage_key)` |

### board_nodes (modifications for image node support)

No schema changes to `board_nodes`. Image node support is implemented through the existing `content` JSONB column and type-specific validation in the application layer.

#### Image node content shape

```json
{
  "assetId": "uuid",
  "caption": "optional string"
}
```

#### Validation rules (application layer)

- `content.assetId` is required for type `image`
- Referenced asset must exist in `assets` table
- Referenced asset must have `processing_status = 'ready'`
- Referenced asset should belong to the same board (soft check — asset.board_id matches node.board_id)
- `content.caption` is optional, max 2,000 characters
- On node update: if `content.assetId` is changed, re-validate the new asset reference
- On node update: if `content` is not touched, skip asset validation

### board_operations (extended operation types)

No schema changes. The existing `operation_type` text column and check constraint need to include `create_asset`.

#### Migration note

The `007_narrow_operation_type.sql` migration defines the current allowed operation types. A new migration (or ALTER of the existing constraint) must add `'create_asset'` to the allowed values.

#### create_asset operation payload shape

```json
{
  "asset": {
    "id": "uuid",
    "boardId": "uuid",
    "kind": "image",
    "mimeType": "image/png",
    "fileSizeBytes": 234567,
    "width": 1280,
    "height": 720,
    "storageKey": "board-id/asset-id/filename.png"
  }
}
```

## Relationships

```text
boards ||--o{ assets : "board_id FK"
assets ||--o{ board_nodes : "content.assetId (application-level reference)"
```

- A board can have many assets
- An asset can be referenced by multiple image nodes (via `content.assetId`)
- Deleting an image node does NOT delete the asset
- Deleting/archiving a board does NOT cascade-delete assets at DB level (ON DELETE SET NULL)

## State Transitions

### Asset processing status

```text
MVP upload path (synchronous):
  → ready (on successful upload with thumbnail generation)

Future async path (not exercised in MVP):
  → pending → processing → ready
                         → failed
```

In MVP, the only observable status after a successful upload is `ready`. Failed uploads do not persist an asset record.

## Migration DDL

```sql
-- 008_create_assets.sql

-- Add 'create_asset' to operation_type check constraint
ALTER TABLE board_operations
  DROP CONSTRAINT IF EXISTS board_operations_operation_type_check;

ALTER TABLE board_operations
  ADD CONSTRAINT board_operations_operation_type_check
    CHECK (operation_type IN (
      'create_node', 'update_node', 'delete_node', 'restore_node',
      'create_edge', 'update_edge', 'delete_edge',
      'create_asset',
      'update_board',
      'apply_agent_action_batch',
      'create_snapshot'
    ));

-- Create assets table
CREATE TABLE assets (
  id uuid PRIMARY KEY,
  board_id uuid REFERENCES boards(id) ON DELETE SET NULL,
  kind text NOT NULL,
  mime_type text,
  original_filename text,
  storage_key text NOT NULL UNIQUE,
  thumbnail_storage_key text,
  file_size_bytes bigint,
  width integer,
  height integer,
  processing_status text NOT NULL DEFAULT 'ready',
  extracted_text text,
  ai_caption text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assets_kind_check
    CHECK (kind IN ('image', 'file')),
  CONSTRAINT assets_processing_status_check
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'))
);

CREATE INDEX idx_assets_board_id ON assets(board_id);
CREATE INDEX idx_assets_kind ON assets(kind);
CREATE INDEX idx_assets_processing_status ON assets(processing_status);
```

## Data Volume Assumptions

- Max image upload size: 20 MB → asset metadata row is small; blob lives in object storage
- Max assets per board: not explicitly capped in MVP; bounded by upload rate limit (20/min)
- Thumbnail size: typically < 100 KB per image (400x400 max WebP)
- Asset metadata row size: ~500 bytes average
