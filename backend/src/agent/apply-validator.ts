import type { PoolClient } from 'pg';
import type { ActionPlanItem } from './types.js';
import { limits } from '../config/limits.js';
import { validateActionPlanReferences } from './output-validator.js';
import * as nodesRepo from '../repos/nodes.repo.js';

interface ApplyValidationSuccess {
  valid: true;
}

interface ApplyValidationLockedNode {
  valid: false;
  code: 'LOCKED_NODE';
  lockedNodeIds: string[];
}

interface ApplyValidationInvalid {
  valid: false;
  code: 'ACTION_PLAN_INVALID';
  reasons: string[];
}

export type ApplyValidationResult =
  | ApplyValidationSuccess
  | ApplyValidationLockedNode
  | ApplyValidationInvalid;

export async function validateApplyPlan(
  plan: ActionPlanItem[],
  boardId: string,
  opts: { client: PoolClient }
): Promise<ApplyValidationResult> {
  const applyLimits = limits.agent.apply;

  // Check plan size
  if (plan.length > applyLimits.maxOperations) {
    return {
      valid: false,
      code: 'ACTION_PLAN_INVALID',
      reasons: [
        `Action plan has ${plan.length} operations, maximum is ${applyLimits.maxOperations}`,
      ],
    };
  }

  // Check for locked nodes before full reference validation
  const lockedNodeIds: string[] = [];
  for (const item of plan) {
    if (item.type === 'update_node' || item.type === 'delete_node') {
      const node = await nodesRepo.findActiveById(opts.client, item.nodeId);
      if (node?.locked) {
        lockedNodeIds.push(item.nodeId);
      }
    }
    if (item.type === 'batch_layout') {
      for (const layoutItem of item.items) {
        const node = await nodesRepo.findActiveById(opts.client, layoutItem.nodeId);
        if (node?.locked) {
          lockedNodeIds.push(layoutItem.nodeId);
        }
      }
    }
  }

  if (lockedNodeIds.length > 0) {
    return {
      valid: false,
      code: 'LOCKED_NODE',
      lockedNodeIds,
    };
  }

  // Full reference validation (reuse from output-validator)
  const refResult = await validateActionPlanReferences(plan, boardId, opts);
  if (!refResult.valid) {
    return {
      valid: false,
      code: 'ACTION_PLAN_INVALID',
      reasons: refResult.reasons,
    };
  }

  return { valid: true };
}
