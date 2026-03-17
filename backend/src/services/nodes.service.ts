import { PoolClient } from 'pg';
import { withBoardMutation, BoardMutationContext } from '../db/tx.js';
import { Board } from '../schemas/board.schemas.js';
import { assertBoardEditable } from '../domain/validation/board-rules.js';
import {
  assertNodeExists,
  assertNodeNotLocked,
  validateNodeContent,
} from '../domain/validation/node-rules.js';
import { applyMergePatch } from '../domain/patch/merge-patch.js';
import { buildOperation } from '../domain/operations/operation-factory.js';
import {
  findActiveById,
  insertNode,
  updateNode as updateNodeRepo,
  softDeleteNode,
} from '../repos/nodes.repo.js';
import { softDeleteByNodeId } from '../repos/edges.repo.js';
import { Node } from '../schemas/board-state.schemas.js';
import { CreateNodeRequest, UpdateNodeRequest } from '../schemas/node.schemas.js';

// ─── In-Transaction Helpers (shared by single-node and batch flows) ─────────

export async function createNodeInTx(
  client: PoolClient,
  board: Board,
  data: CreateNodeRequest
): Promise<Node> {
  validateNodeContent(data.type, data.content);

  const node = await insertNode(client, {
    boardId: board.id,
    type: data.type,
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    content: data.content,
    parentId: data.parentId,
    rotation: data.rotation,
    zIndex: data.zIndex,
    style: data.style,
    metadata: data.metadata,
  });

  return node;
}

export async function updateNodeInTx(
  client: PoolClient,
  _board: Board,
  nodeId: string,
  patch: UpdateNodeRequest
): Promise<{ node: Node; changes: Record<string, unknown>; previous: Record<string, unknown> }> {
  const node = await findActiveById(client, nodeId);
  assertNodeExists(node);
  assertNodeNotLocked(node);

  const fieldsToUpdate: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};

  // Scalar fields
  const scalarFields = ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'parentId', 'locked', 'hidden'] as const;
  for (const field of scalarFields) {
    if (patch[field] !== undefined) {
      fieldsToUpdate[field] = patch[field];
      changes[field] = patch[field];
      previous[field] = node[field];
    }
  }

  // Merge-patch fields (content, style, metadata)
  const mergePatchFields = ['content', 'style', 'metadata'] as const;
  for (const field of mergePatchFields) {
    if (patch[field] !== undefined) {
      const merged = applyMergePatch(
        node[field] as Record<string, unknown>,
        patch[field] as Record<string, unknown>
      );
      fieldsToUpdate[field] = merged;
      changes[field] = patch[field];
      previous[field] = node[field];
    }
  }

  // Validate merged content
  const finalContent = (fieldsToUpdate.content ?? node.content) as Record<string, unknown>;
  validateNodeContent(node.type, finalContent);

  const updatedNode = await updateNodeRepo(client, nodeId, fieldsToUpdate);

  return { node: updatedNode, changes, previous };
}

export async function deleteNodeInTx(
  client: PoolClient,
  _board: Board,
  nodeId: string
): Promise<{ deletedNodeId: string; deletedEdgeIds: string[]; previousState: Record<string, unknown> }> {
  const node = await findActiveById(client, nodeId);
  assertNodeExists(node);
  assertNodeNotLocked(node);

  await softDeleteNode(client, nodeId);
  const deletedEdgeIds = await softDeleteByNodeId(client, nodeId);

  return {
    deletedNodeId: nodeId,
    deletedEdgeIds,
    previousState: {
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      content: node.content,
    },
  };
}

// ─── Create Node ─────────────────────────────────────────────────────────────

export async function createNode(
  boardId: string,
  data: CreateNodeRequest
): Promise<{ node: Node; boardRevision: number }> {
  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    const node = await createNodeInTx(client, board, data);
    const newRevision = board.revision + 1;

    const op = buildOperation({
      boardId,
      boardRevision: newRevision,
      actorType: 'user',
      operationType: 'create_node',
      targetType: 'node',
      targetId: node.id,
      payload: {
        node: {
          id: node.id,
          type: node.type,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          content: node.content,
          style: node.style,
        },
      },
    });

    return {
      result: { node, boardRevision: newRevision },
      operations: [op],
      newRevision,
    };
  });
}

// ─── Update Node ─────────────────────────────────────────────────────────────

export async function updateNode(
  nodeId: string,
  patch: UpdateNodeRequest
): Promise<{ node: Node; boardRevision: number }> {
  const existingNode = await findNodeForMutation(nodeId);
  const boardId = existingNode.boardId;

  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    const { node: updatedNode, changes, previous } = await updateNodeInTx(client, board, nodeId, patch);
    const newRevision = board.revision + 1;

    const op = buildOperation({
      boardId,
      boardRevision: newRevision,
      actorType: 'user',
      operationType: 'update_node',
      targetType: 'node',
      targetId: nodeId,
      payload: { changes, previous },
      inversePayload: { changes: previous, previous: changes },
    });

    return {
      result: { node: updatedNode, boardRevision: newRevision },
      operations: [op],
      newRevision,
    };
  });
}

// ─── Delete Node ─────────────────────────────────────────────────────────────

export async function deleteNode(
  nodeId: string
): Promise<{ deletedNodeId: string; deletedEdgeIds: string[]; boardRevision: number }> {
  const existingNode = await findNodeForMutation(nodeId);
  const boardId = existingNode.boardId;

  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    const { deletedNodeId, deletedEdgeIds, previousState } = await deleteNodeInTx(client, board, nodeId);
    const newRevision = board.revision + 1;
    const operations = [];

    operations.push(
      buildOperation({
        boardId,
        boardRevision: newRevision,
        actorType: 'user',
        operationType: 'delete_node',
        targetType: 'node',
        targetId: nodeId,
        payload: { nodeId, previousState },
      })
    );

    for (const edgeId of deletedEdgeIds) {
      operations.push(
        buildOperation({
          boardId,
          boardRevision: newRevision,
          actorType: 'user',
          operationType: 'delete_edge',
          targetType: 'edge',
          targetId: edgeId,
          payload: { edgeId, reason: 'cascade_node_delete', sourceNodeId: nodeId },
        })
      );
    }

    return {
      result: { deletedNodeId, deletedEdgeIds, boardRevision: newRevision },
      operations,
      newRevision,
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { withTransaction } from '../db/tx.js';

async function findNodeForMutation(nodeId: string): Promise<Node> {
  return withTransaction(async (client) => {
    const node = await findActiveById(client, nodeId);
    assertNodeExists(node);
    return node;
  });
}
