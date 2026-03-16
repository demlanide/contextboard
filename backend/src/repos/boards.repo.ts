import { PoolClient } from 'pg';
import { Board } from '../schemas/board.schemas.js';

function rowToBoard(row: Record<string, unknown>): Board {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    status: row.status as Board['status'],
    viewportState: row.viewport_state as Record<string, unknown>,
    settings: row.settings as Record<string, unknown>,
    summary: row.summary as Record<string, unknown>,
    revision: Number(row.revision),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function insertBoard(
  client: PoolClient,
  board: {
    id: string;
    title: string;
    description: string | null;
  }
): Promise<Board> {
  const { rows } = await client.query(
    `INSERT INTO boards (id, title, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [board.id, board.title, board.description ?? null]
  );
  return rowToBoard(rows[0]);
}

export async function findBoardById(
  client: PoolClient,
  id: string
): Promise<Board | null> {
  const { rows } = await client.query('SELECT * FROM boards WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  return rowToBoard(rows[0]);
}

export async function listBoards(client: PoolClient): Promise<Board[]> {
  const { rows } = await client.query(
    `SELECT * FROM boards WHERE status != 'deleted' ORDER BY updated_at DESC`
  );
  return rows.map(rowToBoard);
}

export async function updateBoard(
  client: PoolClient,
  id: string,
  fields: Partial<{
    title: string;
    description: string | null;
    viewport_state: Record<string, unknown>;
    settings: Record<string, unknown>;
    summary: Record<string, unknown>;
    revision: number;
    status: string;
  }>
): Promise<Board | null> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (fields.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(fields.title);
  }
  if (fields.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(fields.description);
  }
  if (fields.viewport_state !== undefined) {
    setClauses.push(`viewport_state = $${paramIndex++}`);
    values.push(JSON.stringify(fields.viewport_state));
  }
  if (fields.settings !== undefined) {
    setClauses.push(`settings = $${paramIndex++}`);
    values.push(JSON.stringify(fields.settings));
  }
  if (fields.summary !== undefined) {
    setClauses.push(`summary = $${paramIndex++}`);
    values.push(JSON.stringify(fields.summary));
  }
  if (fields.revision !== undefined) {
    setClauses.push(`revision = $${paramIndex++}`);
    values.push(fields.revision);
  }
  if (fields.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(fields.status);
  }

  values.push(id);
  const { rows } = await client.query(
    `UPDATE boards SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  if (rows.length === 0) return null;
  return rowToBoard(rows[0]);
}
