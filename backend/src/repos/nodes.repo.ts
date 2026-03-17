import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Node } from '../schemas/board-state.schemas.js';

function mapNodeRow(row: Record<string, unknown>): Node {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    type: row.type as Node['type'],
    parentId: row.parent_id as string | null,
    x: row.x as number,
    y: row.y as number,
    width: row.width as number,
    height: row.height as number,
    rotation: row.rotation as number,
    zIndex: row.z_index as number,
    content: row.content as Record<string, unknown>,
    style: row.style as Record<string, unknown>,
    metadata: row.metadata as Record<string, unknown>,
    locked: row.locked as boolean,
    hidden: row.hidden as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function findActiveByBoardId(
  client: PoolClient,
  boardId: string
): Promise<Node[]> {
  const { rows } = await client.query(
    `SELECT * FROM board_nodes
     WHERE board_id = $1 AND deleted_at IS NULL
     ORDER BY z_index ASC, created_at ASC`,
    [boardId]
  );
  return rows.map(mapNodeRow);
}

export async function findActiveById(
  client: PoolClient,
  nodeId: string
): Promise<Node | null> {
  const { rows } = await client.query(
    `SELECT * FROM board_nodes WHERE id = $1 AND deleted_at IS NULL`,
    [nodeId]
  );
  if (rows.length === 0) return null;
  return mapNodeRow(rows[0]);
}

export interface InsertNodeParams {
  boardId: string;
  type: Node['type'];
  x: number;
  y: number;
  width: number;
  height: number;
  content: Record<string, unknown>;
  parentId?: string | null;
  rotation?: number;
  zIndex?: number;
  style?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function insertNode(
  client: PoolClient,
  params: InsertNodeParams
): Promise<Node> {
  const id = uuidv4();
  const { rows } = await client.query(
    `INSERT INTO board_nodes (id, board_id, type, parent_id, x, y, width, height, rotation, z_index, content, style, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      id,
      params.boardId,
      params.type,
      params.parentId ?? null,
      params.x,
      params.y,
      params.width,
      params.height,
      params.rotation ?? 0,
      params.zIndex ?? 0,
      JSON.stringify(params.content),
      JSON.stringify(params.style ?? {}),
      JSON.stringify(params.metadata ?? {}),
    ]
  );
  return mapNodeRow(rows[0]);
}

export async function updateNode(
  client: PoolClient,
  nodeId: string,
  fields: Record<string, unknown>
): Promise<Node> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const columnMap: Record<string, string> = {
    x: 'x',
    y: 'y',
    width: 'width',
    height: 'height',
    rotation: 'rotation',
    zIndex: 'z_index',
    content: 'content',
    style: 'style',
    metadata: 'metadata',
    parentId: 'parent_id',
    locked: 'locked',
    hidden: 'hidden',
  };

  for (const [key, value] of Object.entries(fields)) {
    const column = columnMap[key];
    if (!column) continue;
    const needsJson = key === 'content' || key === 'style' || key === 'metadata';
    setClauses.push(`${column} = $${paramIndex}`);
    values.push(needsJson ? JSON.stringify(value) : value);
    paramIndex++;
  }

  setClauses.push(`updated_at = now()`);

  values.push(nodeId);
  const { rows } = await client.query(
    `UPDATE board_nodes SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
    values
  );
  return mapNodeRow(rows[0]);
}

export async function softDeleteNode(
  client: PoolClient,
  nodeId: string
): Promise<void> {
  await client.query(
    `UPDATE board_nodes SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [nodeId]
  );
}
