-- 007_narrow_operation_type.sql
-- Reconcile operation_type CHECK constraint with S3 clarifications:
-- create_board, delete_board, archive_board are removed; board-level
-- state changes use update_board with a before/after status payload.

-- Data fixup: convert any legacy rows to update_board before altering constraint
UPDATE board_operations
SET operation_type = 'update_board'
WHERE operation_type IN ('create_board', 'delete_board', 'archive_board');

-- Re-narrow the CHECK constraint
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
