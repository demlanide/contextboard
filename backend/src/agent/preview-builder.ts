// T006: Preview builder — pure function to compute affected IDs from action plan
import type { ActionPlanItem, PreviewPayload } from './types.js';

export function buildPreview(actionPlan: ActionPlanItem[]): PreviewPayload {
  const affectedNodeIds: string[] = [];
  const affectedEdgeIds: string[] = [];
  const newNodeTempIds: string[] = [];
  const newEdgeTempIds: string[] = [];

  for (const item of actionPlan) {
    switch (item.type) {
      case 'create_node':
        newNodeTempIds.push(item.tempId);
        break;
      case 'update_node':
        affectedNodeIds.push(item.nodeId);
        break;
      case 'delete_node':
        affectedNodeIds.push(item.nodeId);
        break;
      case 'create_edge':
        newEdgeTempIds.push(item.tempId);
        break;
      case 'update_edge':
        affectedEdgeIds.push(item.edgeId);
        break;
      case 'delete_edge':
        affectedEdgeIds.push(item.edgeId);
        break;
      case 'batch_layout':
        for (const layoutItem of item.items) {
          affectedNodeIds.push(layoutItem.nodeId);
        }
        break;
    }
  }

  return {
    affectedNodeIds: [...new Set(affectedNodeIds)],
    affectedEdgeIds: [...new Set(affectedEdgeIds)],
    newNodeTempIds,
    newEdgeTempIds,
  };
}
