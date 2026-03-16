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
