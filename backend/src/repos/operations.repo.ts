import { PoolClient } from 'pg';
import { OperationEntry } from '../domain/operations/operation-factory.js';

export async function insertOperation(
  client: PoolClient,
  op: OperationEntry
): Promise<void> {
  await client.query(
    `INSERT INTO board_operations
       (id, board_id, board_revision, actor_type, operation_type,
        target_type, target_id, batch_id, payload, inverse_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      op.id,
      op.board_id,
      op.board_revision,
      op.actor_type,
      op.operation_type,
      op.target_type,
      op.target_id,
      op.batch_id,
      JSON.stringify(op.payload),
      op.inverse_payload ? JSON.stringify(op.inverse_payload) : null,
    ]
  );
}
