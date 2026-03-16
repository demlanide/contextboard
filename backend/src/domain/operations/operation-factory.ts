import { v4 as uuidv4 } from 'uuid';

export type OperationType =
  | 'create_board'
  | 'update_board'
  | 'delete_board'
  | 'archive_board';

export type TargetType = 'board' | 'node' | 'edge' | 'asset' | 'chat' | 'layout' | 'snapshot';
export type ActorType = 'user' | 'agent' | 'system';

export interface OperationEntry {
  id: string;
  board_id: string;
  board_revision: number;
  actor_type: ActorType;
  operation_type: OperationType;
  target_type: TargetType;
  target_id: string | null;
  batch_id: string | null;
  payload: Record<string, unknown>;
  inverse_payload: Record<string, unknown> | null;
}

export function createBoardOperation(
  boardId: string,
  revision: number,
  payload: { title: string; description: string | null; chatThreadId: string }
): OperationEntry {
  return {
    id: uuidv4(),
    board_id: boardId,
    board_revision: revision,
    actor_type: 'user',
    operation_type: 'create_board',
    target_type: 'board',
    target_id: boardId,
    batch_id: null,
    payload: {
      title: payload.title,
      description: payload.description,
      chatThreadId: payload.chatThreadId,
    },
    inverse_payload: null,
  };
}

export function updateBoardOperation(
  boardId: string,
  newRevision: number,
  changes: Record<string, unknown>,
  previous: Record<string, unknown>
): OperationEntry {
  return {
    id: uuidv4(),
    board_id: boardId,
    board_revision: newRevision,
    actor_type: 'user',
    operation_type: 'update_board',
    target_type: 'board',
    target_id: boardId,
    batch_id: null,
    payload: { changes, previous },
    inverse_payload: null,
  };
}

export function archiveBoardOperation(
  boardId: string,
  newRevision: number,
  previousStatus: string
): OperationEntry {
  return {
    id: uuidv4(),
    board_id: boardId,
    board_revision: newRevision,
    actor_type: 'user',
    operation_type: 'archive_board',
    target_type: 'board',
    target_id: boardId,
    batch_id: null,
    payload: { previousStatus },
    inverse_payload: null,
  };
}

export function deleteBoardOperation(
  boardId: string,
  currentRevision: number,
  previousStatus: string
): OperationEntry {
  return {
    id: uuidv4(),
    board_id: boardId,
    board_revision: currentRevision,
    actor_type: 'user',
    operation_type: 'delete_board',
    target_type: 'board',
    target_id: boardId,
    batch_id: null,
    payload: { previousStatus },
    inverse_payload: null,
  };
}
