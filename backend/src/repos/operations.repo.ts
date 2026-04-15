import { PoolClient } from 'pg';
import { OperationEntry } from '../domain/operations/operation-factory.js';
import { OperationResponse } from '../schemas/operations.schemas.js';

// ─── Write path (used by mutation services) ──────────────────────────────────

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

// ─── Read path (used by polling endpoint) ────────────────────────────────────

function rowToOperationResponse(row: Record<string, unknown>): OperationResponse {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    boardRevision: Number(row.board_revision),
    actorType: row.actor_type as OperationResponse['actorType'],
    operationType: row.operation_type as string,
    targetType: row.target_type as string,
    targetId: (row.target_id as string | null) ?? null,
    batchId: (row.batch_id as string | null) ?? null,
    payload: row.payload as Record<string, unknown>,
    inversePayload: (row.inverse_payload as Record<string, unknown> | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export async function getOperationsAfterRevision(
  client: PoolClient,
  boardId: string,
  afterRevision: number,
  limit: number
): Promise<{ operations: OperationResponse[]; headRevision: number }> {
  // Fetch board's current revision and validate it exists (not deleted)
  const boardResult = await client.query(
    `SELECT revision FROM boards WHERE id = $1 AND status <> 'deleted'`,
    [boardId]
  );
  if (boardResult.rows.length === 0) {
    return { operations: [], headRevision: -1 }; // caller checks headRevision === -1 for not-found
  }
  const headRevision = Number(boardResult.rows[0].revision);

  const opsResult = await client.query(
    `SELECT * FROM board_operations
     WHERE board_id = $1 AND board_revision > $2
     ORDER BY board_revision ASC, id ASC
     LIMIT $3`,
    [boardId, afterRevision, limit]
  );

  return {
    operations: opsResult.rows.map(rowToOperationResponse),
    headRevision,
  };
}
