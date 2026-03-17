import { PoolClient } from 'pg';
import type { ChatMessageResponse } from '../schemas/chat.schemas.js';

function rowToChatMessage(row: Record<string, unknown>): ChatMessageResponse {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    senderType: row.sender_type as 'user' | 'agent' | 'system',
    messageText: row.message_text as string | null,
    messageJson: (row.message_json ?? {}) as Record<string, unknown>,
    selectionContext: (row.selection_context ?? {}) as Record<string, unknown>,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export interface InsertMessageParams {
  id: string;
  thread_id: string;
  sender_type: 'user' | 'agent' | 'system';
  message_text: string | null;
  message_json?: Record<string, unknown>;
  selection_context?: Record<string, unknown>;
}

export async function insertMessage(
  client: PoolClient,
  params: InsertMessageParams
): Promise<ChatMessageResponse> {
  const { rows } = await client.query(
    `INSERT INTO chat_messages (id, thread_id, sender_type, message_text, message_json, selection_context)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.id,
      params.thread_id,
      params.sender_type,
      params.message_text,
      JSON.stringify(params.message_json ?? {}),
      JSON.stringify(params.selection_context ?? {}),
    ]
  );
  return rowToChatMessage(rows[0]);
}

export async function findByThreadId(
  client: PoolClient,
  threadId: string,
  limit: number
): Promise<ChatMessageResponse[]> {
  const { rows } = await client.query(
    `SELECT * FROM chat_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [threadId, limit]
  );
  return rows.map(rowToChatMessage);
}
