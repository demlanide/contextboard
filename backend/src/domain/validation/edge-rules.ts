import { Node } from '../../schemas/board-state.schemas.js';
import { Edge } from '../../schemas/board-state.schemas.js';

// ─── Error Classes ───────────────────────────────────────────────────────────

export class EdgeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'EdgeError';
  }
}

export class EdgeNotFoundError extends EdgeError {
  constructor() {
    super('EDGE_NOT_FOUND', 'Edge not found');
  }
}

export class InvalidEdgeReferenceError extends EdgeError {
  constructor(message: string = 'Invalid edge reference') {
    super('INVALID_EDGE_REFERENCE', message);
  }
}

// ─── Assertions ──────────────────────────────────────────────────────────────

export function assertEdgeExists(edge: Edge | null): asserts edge is Edge {
  if (!edge) {
    throw new EdgeNotFoundError();
  }
}

export function assertEdgeActive(edge: Edge): void {
  // Edges returned by findActiveById already filter deleted_at IS NULL,
  // but this guard handles cases where the edge was fetched differently.
  if ((edge as Edge & { deletedAt?: string | null }).deletedAt) {
    throw new EdgeNotFoundError();
  }
}

export function assertEndpointsExist(
  sourceNode: Node | null,
  targetNode: Node | null
): void {
  if (!sourceNode || !targetNode) {
    throw new InvalidEdgeReferenceError(
      'Source or target node does not exist'
    );
  }
}

export function assertEndpointsActive(
  sourceNode: Node,
  targetNode: Node
): void {
  // Active nodes have no deleted_at; our repo returns null for deleted nodes,
  // so if we reach here they exist. This is a safety check for consistency.
  const src = sourceNode as Node & { deletedAt?: string | null };
  const tgt = targetNode as Node & { deletedAt?: string | null };
  if (src.deletedAt || tgt.deletedAt) {
    throw new InvalidEdgeReferenceError(
      'Source or target node is deleted'
    );
  }
}

export function assertEndpointsSameBoard(
  boardId: string,
  sourceNode: Node,
  targetNode: Node
): void {
  if (sourceNode.boardId !== boardId || targetNode.boardId !== boardId) {
    throw new InvalidEdgeReferenceError(
      'Source or target node belongs to a different board'
    );
  }
}

export function assertNotSelfLoop(
  sourceNodeId: string,
  targetNodeId: string
): void {
  if (sourceNodeId === targetNodeId) {
    throw new EdgeError('VALIDATION_ERROR', 'Self-loop edges are not allowed');
  }
}
