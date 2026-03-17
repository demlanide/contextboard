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
