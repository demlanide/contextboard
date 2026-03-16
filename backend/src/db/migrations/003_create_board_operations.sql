CREATE TABLE IF NOT EXISTS board_operations (
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

CREATE INDEX IF NOT EXISTS idx_board_operations_board_revision
  ON board_operations(board_id, board_revision);
CREATE INDEX IF NOT EXISTS idx_board_operations_board_created
  ON board_operations(board_id, created_at);
CREATE INDEX IF NOT EXISTS idx_board_operations_batch_id
  ON board_operations(batch_id);
CREATE INDEX IF NOT EXISTS idx_board_operations_target
  ON board_operations(target_type, target_id);
