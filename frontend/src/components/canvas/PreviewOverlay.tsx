// T020: PreviewOverlay — renders all preview elements from action plan
import { useBoardStore } from '@/store/board.store'
import { PreviewNode } from './PreviewNode'
import { AgentPreviewEdge } from './PreviewEdge'
import type { ActionPlanItem } from '@/store/types'

export function PreviewOverlay() {
  const agentState = useBoardStore((s) => s.agentState)
  const nodesById = useBoardStore((s) => s.nodesById)
  const edgesById = useBoardStore((s) => s.edgesById)

  if (!agentState.latestSuggestion || !agentState.previewVisible) return null

  const { actionPlan } = agentState.latestSuggestion

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
      {actionPlan.map((item, index) => renderItem(item, index, nodesById, edgesById))}
    </div>
  )
}

function renderItem(
  item: ActionPlanItem,
  index: number,
  nodesById: Record<string, { x: number; y: number; width: number; height: number; content: Record<string, unknown> }>,
  edgesById: Record<string, { sourceNodeId: string; targetNodeId: string }>
) {
  switch (item.type) {
    case 'create_node':
      return (
        <PreviewNode
          key={`create-${index}`}
          actionType="create"
          x={item.node.x}
          y={item.node.y}
          width={item.node.width}
          height={item.node.height}
          text={item.node.content.text}
        />
      )

    case 'update_node': {
      const existing = nodesById[item.nodeId]
      if (!existing) return null
      return (
        <PreviewNode
          key={`update-${index}`}
          actionType="update"
          x={item.patch.x ?? existing.x}
          y={item.patch.y ?? existing.y}
          width={item.patch.width ?? existing.width}
          height={item.patch.height ?? existing.height}
          text={existing.content?.text as string | null}
          patchText={item.patch.content?.text}
        />
      )
    }

    case 'delete_node': {
      const existing = nodesById[item.nodeId]
      if (!existing) return null
      return (
        <PreviewNode
          key={`delete-${index}`}
          actionType="delete"
          x={existing.x}
          y={existing.y}
          width={existing.width}
          height={existing.height}
          text={existing.content?.text as string | null}
        />
      )
    }

    case 'create_edge': {
      const srcNode = nodesById[item.edge.sourceNodeId]
      const tgtNode = nodesById[item.edge.targetNodeId]
      if (!srcNode || !tgtNode) return null
      return (
        <AgentPreviewEdge
          key={`create-edge-${index}`}
          actionType="create"
          sourceX={srcNode.x + srcNode.width / 2}
          sourceY={srcNode.y + srcNode.height / 2}
          targetX={tgtNode.x + tgtNode.width / 2}
          targetY={tgtNode.y + tgtNode.height / 2}
        />
      )
    }

    case 'delete_edge': {
      const edge = edgesById[item.edgeId]
      if (!edge) return null
      const srcNode = nodesById[edge.sourceNodeId]
      const tgtNode = nodesById[edge.targetNodeId]
      if (!srcNode || !tgtNode) return null
      return (
        <AgentPreviewEdge
          key={`delete-edge-${index}`}
          actionType="delete"
          sourceX={srcNode.x + srcNode.width / 2}
          sourceY={srcNode.y + srcNode.height / 2}
          targetX={tgtNode.x + tgtNode.width / 2}
          targetY={tgtNode.y + tgtNode.height / 2}
        />
      )
    }

    case 'batch_layout':
      return item.items.map((layoutItem, li) => {
        const existing = nodesById[layoutItem.nodeId]
        if (!existing) return null
        return (
          <PreviewNode
            key={`layout-${index}-${li}`}
            actionType="update"
            x={layoutItem.x}
            y={layoutItem.y}
            width={existing.width}
            height={existing.height}
            text={existing.content?.text as string | null}
          />
        )
      })

    default:
      return null
  }
}
