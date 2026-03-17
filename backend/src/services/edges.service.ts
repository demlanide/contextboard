import { withBoardMutation, withTransaction } from '../db/tx.js';
import { assertBoardEditable } from '../domain/validation/board-rules.js';
import {
  assertEdgeExists,
  assertEdgeActive,
  assertEndpointsExist,
  assertEndpointsActive,
  assertEndpointsSameBoard,
  assertNotSelfLoop,
} from '../domain/validation/edge-rules.js';
import { applyMergePatch } from '../domain/patch/merge-patch.js';
import { buildOperation } from '../domain/operations/operation-factory.js';
import {
  findActiveById,
  insertEdge,
  updateEdge as updateEdgeRepo,
  softDeleteEdge,
} from '../repos/edges.repo.js';
import { findActiveById as findNodeActiveById } from '../repos/nodes.repo.js';
import { Edge } from '../schemas/board-state.schemas.js';
import { CreateEdgeRequest, UpdateEdgeRequest } from '../schemas/edge.schemas.js';

// ─── Create Edge ────────────────────────────────────────────────────────────

export async function createEdge(
  boardId: string,
  data: CreateEdgeRequest
): Promise<{ edge: Edge; boardRevision: number }> {
  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    assertNotSelfLoop(data.sourceNodeId, data.targetNodeId);

    const sourceNode = await findNodeActiveById(client, data.sourceNodeId);
    const targetNode = await findNodeActiveById(client, data.targetNodeId);
    assertEndpointsExist(sourceNode, targetNode);
    assertEndpointsActive(sourceNode!, targetNode!);
    assertEndpointsSameBoard(boardId, sourceNode!, targetNode!);

    const edge = await insertEdge(client, {
      boardId,
      sourceNodeId: data.sourceNodeId,
      targetNodeId: data.targetNodeId,
      label: data.label,
      style: data.style,
      metadata: data.metadata,
    });

    const newRevision = board.revision + 1;

    const op = buildOperation({
      boardId,
      boardRevision: newRevision,
      actorType: 'user',
      operationType: 'create_edge',
      targetType: 'edge',
      targetId: edge.id,
      payload: {
        edge: {
          id: edge.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          label: edge.label,
        },
      },
    });

    return {
      result: { edge, boardRevision: newRevision },
      operations: [op],
      newRevision,
    };
  });
}

// ─── Update Edge ────────────────────────────────────────────────────────────

export async function updateEdge(
  edgeId: string,
  patch: UpdateEdgeRequest
): Promise<{ edge: Edge; boardRevision: number }> {
  const existingEdge = await findEdgeForMutation(edgeId);
  const boardId = existingEdge.boardId;

  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    const edge = await findActiveById(client, edgeId);
    assertEdgeExists(edge);
    assertEdgeActive(edge);

    const fieldsToUpdate: Record<string, unknown> = {};
    const changes: Record<string, unknown> = {};
    const previous: Record<string, unknown> = {};

    // Handle label directly (not a merge-patch field)
    if (patch.label !== undefined) {
      fieldsToUpdate.label = patch.label;
      changes.label = patch.label;
      previous.label = edge.label;
    }

    // Merge-patch fields (style, metadata)
    const mergePatchFields = ['style', 'metadata'] as const;
    for (const field of mergePatchFields) {
      if (patch[field] !== undefined) {
        const merged = applyMergePatch(
          edge[field] as Record<string, unknown>,
          patch[field] as Record<string, unknown>
        );
        fieldsToUpdate[field] = merged;
        changes[field] = patch[field];
        previous[field] = edge[field];
      }
    }

    const updatedEdge = await updateEdgeRepo(client, edgeId, fieldsToUpdate);
    const newRevision = board.revision + 1;

    const op = buildOperation({
      boardId,
      boardRevision: newRevision,
      actorType: 'user',
      operationType: 'update_edge',
      targetType: 'edge',
      targetId: edgeId,
      payload: { changes, previous },
      inversePayload: { changes: previous, previous: changes },
    });

    return {
      result: { edge: updatedEdge, boardRevision: newRevision },
      operations: [op],
      newRevision,
    };
  });
}

// ─── Delete Edge ────────────────────────────────────────────────────────────

export async function deleteEdge(
  edgeId: string
): Promise<{ deletedEdgeId: string; boardRevision: number }> {
  const existingEdge = await findEdgeForMutation(edgeId);
  const boardId = existingEdge.boardId;

  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    const edge = await findActiveById(client, edgeId);
    assertEdgeExists(edge);
    assertEdgeActive(edge);

    await softDeleteEdge(client, edgeId);

    const newRevision = board.revision + 1;

    const op = buildOperation({
      boardId,
      boardRevision: newRevision,
      actorType: 'user',
      operationType: 'delete_edge',
      targetType: 'edge',
      targetId: edgeId,
      payload: {
        edgeId,
        previousState: {
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          label: edge.label,
        },
      },
    });

    return {
      result: { deletedEdgeId: edgeId, boardRevision: newRevision },
      operations: [op],
      newRevision,
    };
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findEdgeForMutation(edgeId: string): Promise<Edge> {
  return withTransaction(async (client) => {
    const edge = await findActiveById(client, edgeId);
    assertEdgeExists(edge);
    return edge;
  });
}
