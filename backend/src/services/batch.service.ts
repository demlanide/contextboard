import { v4 as uuidv4 } from 'uuid';
import { withBoardMutation } from '../db/tx.js';
import { assertBoardEditable } from '../domain/validation/board-rules.js';
import { validateBatchSize, validateNoDuplicateTempIds } from '../domain/validation/batch-rules.js';
import { TempIdMap } from '../domain/ids/temp-id-map.js';
import { buildOperation, OperationEntry } from '../domain/operations/operation-factory.js';
import { createNodeInTx, updateNodeInTx, deleteNodeInTx } from './nodes.service.js';
import { BatchOperationItem, BatchResponse } from '../schemas/batch.schemas.js';
import { Node } from '../schemas/board-state.schemas.js';
import { logger } from '../obs/logger.js';

interface BatchCreatedEntry extends Node {
  tempId: string;
}

interface BatchDeletedEntry {
  id: string;
  type: 'node' | 'edge';
}

export async function executeBatch(
  boardId: string,
  operations: BatchOperationItem[]
): Promise<BatchResponse> {
  validateBatchSize(operations);
  validateNoDuplicateTempIds(operations as Array<{ type: string; tempId?: string }>);

  return withBoardMutation(boardId, async ({ client, board }) => {
    assertBoardEditable(board);

    const batchId = uuidv4();
    const tempIdMap = new TempIdMap();
    const newRevision = board.revision + 1;

    const created: BatchCreatedEntry[] = [];
    const updated: Node[] = [];
    const deleted: BatchDeletedEntry[] = [];
    const ops: OperationEntry[] = [];

    for (const item of operations) {
      switch (item.type) {
        case 'create': {
          const node = await createNodeInTx(client, board, item.node);
          tempIdMap.register(item.tempId, node.id);
          created.push({ ...node, tempId: item.tempId });

          ops.push(buildOperation({
            boardId,
            boardRevision: newRevision,
            actorType: 'user',
            operationType: 'create_node',
            targetType: 'node',
            targetId: node.id,
            batchId,
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
          }));
          break;
        }

        case 'update': {
          const resolvedNodeId = tempIdMap.resolve(item.nodeId);
          const { node, changes, previous } = await updateNodeInTx(client, board, resolvedNodeId, item.changes);
          updated.push(node);

          ops.push(buildOperation({
            boardId,
            boardRevision: newRevision,
            actorType: 'user',
            operationType: 'update_node',
            targetType: 'node',
            targetId: resolvedNodeId,
            batchId,
            payload: { changes, previous },
            inversePayload: { changes: previous, previous: changes },
          }));
          break;
        }

        case 'delete': {
          const { deletedNodeId, deletedEdgeIds, previousState } = await deleteNodeInTx(client, board, item.nodeId);
          deleted.push({ id: deletedNodeId, type: 'node' });

          for (const edgeId of deletedEdgeIds) {
            deleted.push({ id: edgeId, type: 'edge' });
          }

          ops.push(buildOperation({
            boardId,
            boardRevision: newRevision,
            actorType: 'user',
            operationType: 'delete_node',
            targetType: 'node',
            targetId: deletedNodeId,
            batchId,
            payload: { nodeId: deletedNodeId, previousState },
          }));

          for (const edgeId of deletedEdgeIds) {
            ops.push(buildOperation({
              boardId,
              boardRevision: newRevision,
              actorType: 'user',
              operationType: 'delete_edge',
              targetType: 'edge',
              targetId: edgeId,
              batchId,
              payload: { edgeId, reason: 'cascade_node_delete', sourceNodeId: deletedNodeId },
            }));
          }
          break;
        }
      }
    }

    logger.info('Batch mutation prepared', {
      boardId,
      batchId,
      opCount: operations.length,
      opTypes: operations.map((o) => o.type),
    });

    return {
      result: { batchId, boardRevision: newRevision, created, updated, deleted },
      operations: ops,
      newRevision,
    };
  });
}
