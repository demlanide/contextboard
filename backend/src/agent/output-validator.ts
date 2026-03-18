// T010: Output validator — schema validation + reference validation
import { PoolClient } from 'pg';
import { LLMOutputSchema } from '../schemas/agent.schemas.js';
import { limits } from '../config/limits.js';
import * as nodesRepo from '../repos/nodes.repo.js';
import * as edgesRepo from '../repos/edges.repo.js';
import {
  assertActionTypeAllowed,
  assertNodeMutable,
  assertEdgeMutable,
  ActionPlanError,
} from '../domain/validation/action-plan-rules.js';
import type { ActionPlanItem, ValidatedLLMOutput } from './types.js';

interface SchemaValidationSuccess {
  valid: true;
  parsed: ValidatedLLMOutput;
}

interface SchemaValidationFailure {
  valid: false;
  reasons: string[];
}

export function validateLLMOutput(
  raw: unknown
): SchemaValidationSuccess | SchemaValidationFailure {
  try {
    const parsed = LLMOutputSchema.parse(raw);

    // Check plan size
    if (parsed.actionPlan.length > limits.agent.maxActionItems) {
      return {
        valid: false,
        reasons: [`Action plan has ${parsed.actionPlan.length} items, maximum is ${limits.agent.maxActionItems}`],
      };
    }

    // Check all action types allowed
    for (const item of parsed.actionPlan) {
      assertActionTypeAllowed(item.type);
    }

    return {
      valid: true,
      parsed: parsed as ValidatedLLMOutput,
    };
  } catch (err) {
    if (err instanceof ActionPlanError) {
      return { valid: false, reasons: [err.message] };
    }
    if (err && typeof err === 'object' && 'issues' in err) {
      const zodErr = err as { issues: Array<{ message: string; path: (string | number)[] }> };
      return {
        valid: false,
        reasons: zodErr.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
    }
    return { valid: false, reasons: [String(err)] };
  }
}

export async function validateActionPlanReferences(
  plan: ActionPlanItem[],
  boardId: string,
  { client }: { client: PoolClient }
): Promise<{ valid: true } | { valid: false; reasons: string[] }> {
  const reasons: string[] = [];
  const tempNodeIds = new Set<string>();

  for (const item of plan) {
    try {
      switch (item.type) {
        case 'create_node':
          tempNodeIds.add(item.tempId);
          break;

        case 'update_node': {
          const node = await nodesRepo.findActiveById(client, item.nodeId);
          assertNodeMutable(
            node ? { ...node, deleted: false } : null,
            boardId
          );
          break;
        }

        case 'delete_node': {
          const node = await nodesRepo.findActiveById(client, item.nodeId);
          assertNodeMutable(
            node ? { ...node, deleted: false } : null,
            boardId
          );
          break;
        }

        case 'create_edge': {
          // Source and target can be existing node IDs or tempIds
          if (!tempNodeIds.has(item.edge.sourceNodeId)) {
            const srcNode = await nodesRepo.findActiveById(client, item.edge.sourceNodeId);
            if (!srcNode) {
              reasons.push(`create_edge source '${item.edge.sourceNodeId}' does not exist`);
            } else if (srcNode.boardId !== boardId) {
              reasons.push(`create_edge source '${item.edge.sourceNodeId}' belongs to a different board`);
            }
          }
          if (!tempNodeIds.has(item.edge.targetNodeId)) {
            const tgtNode = await nodesRepo.findActiveById(client, item.edge.targetNodeId);
            if (!tgtNode) {
              reasons.push(`create_edge target '${item.edge.targetNodeId}' does not exist`);
            } else if (tgtNode.boardId !== boardId) {
              reasons.push(`create_edge target '${item.edge.targetNodeId}' belongs to a different board`);
            }
          }
          break;
        }

        case 'update_edge': {
          const edge = await edgesRepo.findActiveById(client, item.edgeId);
          assertEdgeMutable(
            edge ? { ...edge, deleted: false } : null,
            boardId
          );
          break;
        }

        case 'delete_edge': {
          const edge = await edgesRepo.findActiveById(client, item.edgeId);
          assertEdgeMutable(
            edge ? { ...edge, deleted: false } : null,
            boardId
          );
          break;
        }

        case 'batch_layout': {
          for (const layoutItem of item.items) {
            const node = await nodesRepo.findActiveById(client, layoutItem.nodeId);
            assertNodeMutable(
              node ? { ...node, deleted: false } : null,
              boardId
            );
          }
          break;
        }
      }
    } catch (err) {
      if (err instanceof ActionPlanError) {
        reasons.push(err.message);
      } else {
        reasons.push(String(err));
      }
    }
  }

  if (reasons.length > 0) {
    return { valid: false, reasons };
  }
  return { valid: true };
}
