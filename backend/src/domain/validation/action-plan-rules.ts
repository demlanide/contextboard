// T011: Action plan validation rules

export const ALLOWED_ACTION_TYPES = [
  'create_node',
  'update_node',
  'delete_node',
  'create_edge',
  'update_edge',
  'delete_edge',
  'batch_layout',
] as const;

export class ActionPlanError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ActionPlanError';
  }
}

export function assertActionTypeAllowed(type: string): void {
  if (!(ALLOWED_ACTION_TYPES as readonly string[]).includes(type)) {
    throw new ActionPlanError(
      'INVALID_ACTION_TYPE',
      `Action type '${type}' is not allowed. Allowed types: ${ALLOWED_ACTION_TYPES.join(', ')}`
    );
  }
}

export function assertNodeMutable(
  node: { id: string; boardId: string; deleted?: boolean; locked: boolean } | null,
  expectedBoardId: string
): void {
  if (!node) {
    throw new ActionPlanError('NODE_NOT_FOUND', 'Referenced node does not exist');
  }
  if (node.deleted) {
    throw new ActionPlanError('NODE_DELETED', `Referenced node '${node.id}' is deleted`);
  }
  if (node.boardId !== expectedBoardId) {
    throw new ActionPlanError('NODE_WRONG_BOARD', `Referenced node '${node.id}' belongs to a different board`);
  }
  if (node.locked) {
    throw new ActionPlanError('NODE_LOCKED', `Referenced node '${node.id}' is locked`);
  }
}

export function assertEdgeMutable(
  edge: { id: string; boardId: string; deleted?: boolean } | null,
  expectedBoardId: string
): void {
  if (!edge) {
    throw new ActionPlanError('EDGE_NOT_FOUND', 'Referenced edge does not exist');
  }
  if (edge.deleted) {
    throw new ActionPlanError('EDGE_DELETED', `Referenced edge '${edge.id}' is deleted`);
  }
  if (edge.boardId !== expectedBoardId) {
    throw new ActionPlanError('EDGE_WRONG_BOARD', `Referenced edge '${edge.id}' belongs to a different board`);
  }
}
