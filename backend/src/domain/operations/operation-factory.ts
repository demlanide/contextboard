import { v4 as uuidv4 } from 'uuid';

export type OperationType =
  | 'update_board'
  | 'create_node'
  | 'update_node'
  | 'delete_node'
  | 'restore_node'
  | 'create_edge'
  | 'update_edge'
  | 'delete_edge'
  | 'create_asset'
  | 'apply_agent_action_batch'
  | 'create_snapshot';

export type TargetType = 'board' | 'node' | 'edge' | 'asset' | 'chat' | 'layout' | 'snapshot';
export type ActorType = 'user' | 'agent' | 'system';

// ─── Payload Interfaces ───────────────────────────────────────────────────────

export interface UpdateBoardPayload {
  changes: Record<string, unknown>;
  previous: Record<string, unknown>;
}

export interface UpdateBoardStatusPayload {
  before: { status: string };
  after: { status: string };
}

export interface CreateNodePayload {
  node: {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    content: Record<string, unknown>;
    style: Record<string, unknown>;
  };
}

export interface UpdateNodePayload {
  changes: Record<string, unknown>;
  previous: Record<string, unknown>;
}

export interface DeleteNodePayload {
  nodeId: string;
  previousState: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    content: Record<string, unknown>;
  };
}

export interface CreateEdgePayload {
  edge: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    label: string | null;
  };
}

export interface UpdateEdgePayload {
  changes: Record<string, unknown>;
  previous: Record<string, unknown>;
}

export interface DeleteEdgePayload {
  edgeId: string;
  previousState: {
    sourceNodeId: string;
    targetNodeId: string;
    label: string | null;
  };
}

// ─── OperationEntry ───────────────────────────────────────────────────────────

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

// ─── Generalized Factory ──────────────────────────────────────────────────────

export interface BuildOperationParams {
  boardId: string;
  boardRevision: number;
  actorType: ActorType;
  operationType: OperationType;
  targetType: TargetType;
  targetId?: string | null;
  batchId?: string | null;
  payload: Record<string, unknown>;
  inversePayload?: Record<string, unknown> | null;
}

export function buildOperation(params: BuildOperationParams): OperationEntry {
  return {
    id: uuidv4(),
    board_id: params.boardId,
    board_revision: params.boardRevision,
    actor_type: params.actorType,
    operation_type: params.operationType,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    batch_id: params.batchId ?? null,
    payload: params.payload,
    inverse_payload: params.inversePayload ?? null,
  };
}

// ─── Convenience Wrapper (backward-compat with S1) ───────────────────────────

export function updateBoardOperation(
  boardId: string,
  newRevision: number,
  changes: Record<string, unknown>,
  previous: Record<string, unknown>
): OperationEntry {
  return buildOperation({
    boardId,
    boardRevision: newRevision,
    actorType: 'user',
    operationType: 'update_board',
    targetType: 'board',
    targetId: boardId,
    payload: { changes, previous },
  });
}
