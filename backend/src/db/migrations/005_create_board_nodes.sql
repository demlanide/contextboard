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
