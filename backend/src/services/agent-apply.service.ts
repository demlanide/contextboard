import { withBoardMutation } from '../db/tx.js';
import { assertBoardEditable } from '../domain/validation/board-rules.js';
import { TempIdMap } from '../domain/ids/temp-id-map.js';
import { buildOperation, type OperationEntry } from '../domain/operations/operation-factory.js';
import { createNodeInTx, updateNodeInTx, deleteNodeInTx } from './nodes.service.js';
import { createEdgeInTx, updateEdgeInTx, deleteEdgeInTx } from './edges.service.js';
import { findActiveByBoardId as findActiveNodes } from '../repos/nodes.repo.js';
import { findActiveByBoardId as findActiveEdges } from '../repos/edges.repo.js';
import { normalizeActionPlanForHash } from '../agent/apply-normalizer.js';
import { computeApplyIdempotencyKey } from '../agent/apply-idempotency.js';
import { createApplyIdempotencyStore } from '../agent/apply-idempotency-store.js';
import { validateApplyPlan } from '../agent/apply-validator.js';
import { limits } from '../config/limits.js';
import { logger } from '../obs/logger.js';
import type { ActionPlanItem } from '../agent/types.js';
import type { ApplyResponse } from '../schemas/agent.schemas.js';

// Module-level singleton idempotency store
const idempotencyStore = createApplyIdempotencyStore();
const idempotencyTtlMs = limits.agent.apply.idempotencyRetentionMinutes * 60 * 1000;

export class ApplyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ApplyError';
  }
}

export async function applyActionPlan(
  boardId: string,
  actionPlan: ActionPlanItem[]
): Promise<ApplyResponse> {
  // Check payload size
  const payloadSize = Buffer.byteLength(JSON.stringify(actionPlan), 'utf8');
  if (payloadSize > limits.agent.apply.maxPayloadBytes) {
    throw new ApplyError(
      'ACTION_PLAN_TOO_LARGE',
      'This set of changes is too large to apply at once. Try splitting it into smaller steps.',
      {
        maxOperations: limits.agent.apply.maxOperations,
        maxPayloadBytes: limits.agent.apply.maxPayloadBytes,
      }
    );
  }

  if (actionPlan.length > limits.agent.apply.maxOperations) {
    throw new ApplyError(
      'ACTION_PLAN_TOO_LARGE',
      'This set of changes is too large to apply at once. Try splitting it into smaller steps.',
      {
        maxOperations: limits.agent.apply.maxOperations,
        maxPayloadBytes: limits.agent.apply.maxPayloadBytes,
      }
    );
  }

  // Compute idempotency key (pre-mutation, so we use current revision inside the tx)
  const normalizedPlan = normalizeActionPlanForHash(actionPlan);

  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    // Check idempotency
    const idempotencyKey = computeApplyIdempotencyKey(normalizedPlan, board.revision);
    const cached = idempotencyStore.get(idempotencyKey);
    if (cached) {
      logger.info('Apply idempotency hit', { boardId, idempotencyKey });
      return {
        result: cached,
        operations: [],
        newRevision: null,
      };
    }

    // Validate plan
    const validation = await validateApplyPlan(actionPlan, boardId, { client });
    if (!validation.valid) {
      if (validation.code === 'LOCKED_NODE') {
        throw new ApplyError(
          'LOCKED_NODE',
          'Some items in the plan target locked content and cannot be changed.',
          { lockedNodeIds: validation.lockedNodeIds }
        );
      }
      throw new ApplyError(
        'ACTION_PLAN_INVALID',
        'The proposed changes no longer match the current board.',
        { reasons: validation.reasons }
      );
    }

    // Execute plan
    const tempIdMap = new TempIdMap();
    const newRevision = board.revision + 1;
    const operations: OperationEntry[] = [];

    for (const item of actionPlan) {
      switch (item.type) {
        case 'create_node': {
          const node = await createNodeInTx(client, board, {
            type: item.node.type,
            x: item.node.x,
            y: item.node.y,
            width: item.node.width,
            height: item.node.height,
            content: item.node.content as Record<string, unknown>,
            style: item.node.style ?? {},
            metadata: item.node.metadata as Record<string, unknown>,
            parentId: null,
            rotation: 0,
            zIndex: 0,
          });
          tempIdMap.register(item.tempId, node.id);
          operations.push(
            buildOperation({
              boardId,
              boardRevision: newRevision,
              actorType: 'agent',
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
            })
          );
          break;
        }

        case 'update_node': {
          const resolvedNodeId = tempIdMap.resolve(item.nodeId);
          const { node, changes, previous } = await updateNodeInTx(
            client,
            board,
            resolvedNodeId,
            item.patch
          );
          operations.push(
            buildOperation({
              boardId,
              boardRevision: newRevision,
              actorType: 'agent',
              operationType: 'update_node',
              targetType: 'node',
              targetId: resolvedNodeId,
              payload: { changes, previous },
              inversePayload: { changes: previous, previous: changes },
            })
          );
          break;
        }

        case 'delete_node': {
          const { deletedNodeId, deletedEdgeIds, previousState } = await deleteNodeInTx(
            client,
            board,
            item.nodeId
          );
          operations.push(
            buildOperation({
              boardId,
              boardRevision: newRevision,
              actorType: 'agent',
              operationType: 'delete_node',
              targetType: 'node',
              targetId: item.nodeId,
              payload: { nodeId: item.nodeId, previousState },
            })
          );
          for (const edgeId of deletedEdgeIds) {
            operations.push(
              buildOperation({
                boardId,
                boardRevision: newRevision,
                actorType: 'agent',
                operationType: 'delete_edge',
                targetType: 'edge',
                targetId: edgeId,
                payload: { edgeId, reason: 'cascade_node_delete', sourceNodeId: item.nodeId },
              })
            );
          }
          break;
        }

        case 'create_edge': {
          const resolvedSourceId = tempIdMap.resolve(item.edge.sourceNodeId);
          const resolvedTargetId = tempIdMap.resolve(item.edge.targetNodeId);
          const edge = await createEdgeInTx(client, board, {
            sourceNodeId: resolvedSourceId,
            targetNodeId: resolvedTargetId,
            label: item.edge.label ?? null,
            style: {},
            metadata: {},
          });
          tempIdMap.register(item.tempId, edge.id);
          operations.push(
            buildOperation({
              boardId,
              boardRevision: newRevision,
              actorType: 'agent',
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
            })
          );
          break;
        }

        case 'update_edge': {
          const { edge, changes, previous } = await updateEdgeInTx(
            client,
            board,
            item.edgeId,
            { label: item.patch.label, style: undefined, metadata: undefined }
          );
          operations.push(
            buildOperation({
              boardId,
              boardRevision: newRevision,
              actorType: 'agent',
              operationType: 'update_edge',
              targetType: 'edge',
              targetId: item.edgeId,
              payload: { changes, previous },
              inversePayload: { changes: previous, previous: changes },
            })
          );
          break;
        }

        case 'delete_edge': {
          const { edgeId, previousState } = await deleteEdgeInTx(
            client,
            board,
            item.edgeId
          );
          operations.push(
            buildOperation({
              boardId,
              boardRevision: newRevision,
              actorType: 'agent',
              operationType: 'delete_edge',
              targetType: 'edge',
              targetId: item.edgeId,
              payload: { edgeId, previousState },
            })
          );
          break;
        }

        case 'batch_layout': {
          for (const layoutItem of item.items) {
            const resolvedId = tempIdMap.resolve(layoutItem.nodeId);
            const { changes, previous } = await updateNodeInTx(
              client,
              board,
              resolvedId,
              { x: layoutItem.x, y: layoutItem.y }
            );
            operations.push(
              buildOperation({
                boardId,
                boardRevision: newRevision,
                actorType: 'agent',
                operationType: 'update_node',
                targetType: 'node',
                targetId: resolvedId,
                payload: { changes, previous },
                inversePayload: { changes: previous, previous: changes },
              })
            );
          }
          break;
        }
      }
    }

    // Hydrate updated board state
    const [nodes, edges] = await Promise.all([
      findActiveNodes(client, boardId),
      findActiveEdges(client, boardId),
    ]);

    // Build temp ID mapping for response
    const tempIdMapping: ApplyResponse['tempIdMapping'] = {
      nodes: {} as Record<string, string>,
      edges: {} as Record<string, string>,
    };
    for (const item of actionPlan) {
      if (item.type === 'create_node') {
        tempIdMapping.nodes[item.tempId] = tempIdMap.resolve(item.tempId);
      }
      if (item.type === 'create_edge') {
        tempIdMapping.edges[item.tempId] = tempIdMap.resolve(item.tempId);
      }
    }

    const applyResult: ApplyResponse = {
      boardRevision: newRevision,
      updatedBoard: {
        id: boardId,
        revision: newRevision,
        nodes,
        edges,
      },
      tempIdMapping,
    };

    // Store for idempotency
    idempotencyStore.set(idempotencyKey, applyResult, idempotencyTtlMs);

    return {
      result: applyResult,
      operations,
      newRevision,
    };
  });
}
