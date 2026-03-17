import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
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

export async function findActiveById(
  client: PoolClient,
  edgeId: string
): Promise<Edge | null> {
  const { rows } = await client.query(
    `SELECT * FROM board_edges WHERE id = $1 AND deleted_at IS NULL`,
    [edgeId]
  );
  if (rows.length === 0) return null;
  return mapEdgeRow(rows[0]);
}

export interface InsertEdgeParams {
  boardId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string | null;
  style?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function insertEdge(
  client: PoolClient,
  params: InsertEdgeParams
): Promise<Edge> {
  const id = uuidv4();
  const { rows } = await client.query(
    `INSERT INTO board_edges (id, board_id, source_node_id, target_node_id, label, style, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      id,
      params.boardId,
      params.sourceNodeId,
      params.targetNodeId,
      params.label ?? null,
      JSON.stringify(params.style ?? {}),
      JSON.stringify(params.metadata ?? {}),
    ]
  );
  return mapEdgeRow(rows[0]);
}

export async function updateEdge(
  client: PoolClient,
  edgeId: string,
  fields: Record<string, unknown>
): Promise<Edge> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const columnMap: Record<string, string> = {
    label: 'label',
    style: 'style',
    metadata: 'metadata',
  };

  for (const [key, value] of Object.entries(fields)) {
    const column = columnMap[key];
    if (!column) continue;
    const needsJson = key === 'style' || key === 'metadata';
    setClauses.push(`${column} = $${paramIndex}`);
    values.push(needsJson ? JSON.stringify(value) : value);
    paramIndex++;
  }

  setClauses.push(`updated_at = now()`);

  values.push(edgeId);
  const { rows } = await client.query(
    `UPDATE board_edges SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
    values
  );
  return mapEdgeRow(rows[0]);
}

export async function softDeleteEdge(
  client: PoolClient,
  edgeId: string
): Promise<void> {
  await client.query(
    `UPDATE board_edges SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [edgeId]
  );
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
