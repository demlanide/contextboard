import { PoolClient } from 'pg';
import { Edge } from '../schemas/board-state.schemas.js';

function mapEdgeRow(row: Record<string, unknown>): Edge {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    sourceNodeId: row.source_node_id as string,
    targetNodeId: row.target_node_id as string,
    label: row.label as string | null,
    style: row.style as Record<string, unknown>,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function findActiveByBoardId(
  client: PoolClient,
  boardId: string
): Promise<Edge[]> {
  const { rows } = await client.query(
    `SELECT * FROM board_edges
     WHERE board_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [boardId]
  );
  return rows.map(mapEdgeRow);
}

export async function softDeleteByNodeId(
  client: PoolClient,
  nodeId: string
): Promise<string[]> {
  const { rows } = await client.query(
    `UPDATE board_edges
     SET deleted_at = now(), updated_at = now()
     WHERE (source_node_id = $1 OR target_node_id = $1) AND deleted_at IS NULL
     RETURNING id`,
    [nodeId]
  );
  return rows.map((r: Record<string, unknown>) => r.id as string);
}
