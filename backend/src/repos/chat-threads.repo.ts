import { PoolClient } from 'pg';
import { ChatThread } from '../schemas/board.schemas.js';

function rowToChatThread(row: Record<string, unknown>): ChatThread {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function findByBoardId(
  client: PoolClient,
  boardId: string
): Promise<ChatThread | null> {
  const { rows } = await client.query(
    `SELECT * FROM chat_threads WHERE board_id = $1`,
    [boardId]
  );
  if (rows.length === 0) return null;
  return rowToChatThread(rows[0]);
}

export async function insertChatThread(
  client: PoolClient,
  thread: { id: string; board_id: string }
): Promise<ChatThread> {
  const { rows } = await client.query(
    `INSERT INTO chat_threads (id, board_id) VALUES ($1, $2) RETURNING *`,
    [thread.id, thread.board_id]
  );
  return rowToChatThread(rows[0]);
}
