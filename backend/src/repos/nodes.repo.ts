import { PoolClient } from 'pg';
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
