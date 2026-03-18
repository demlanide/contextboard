// T021: ActionSummaryList — renders structured list of planned actions
import type { ActionPlanItem } from '@/store/types'

interface Props {
  actionPlan: ActionPlanItem[]
  onDismiss?: () => void
}

function countByType(plan: ActionPlanItem[]) {
  const counts = {
    createNode: 0,
    updateNode: 0,
    deleteNode: 0,
    createEdge: 0,
    deleteEdge: 0,
    repositionNode: 0,
    updateEdge: 0,
  }

  for (const item of plan) {
    switch (item.type) {
      case 'create_node': counts.createNode++; break
      case 'update_node': counts.updateNode++; break
      case 'delete_node': counts.deleteNode++; break
      case 'create_edge': counts.createEdge++; break
      case 'update_edge': counts.updateEdge++; break
      case 'delete_edge': counts.deleteEdge++; break
      case 'batch_layout': counts.repositionNode += item.items.length; break
    }
  }

  return counts
}

const ICONS: Record<string, string> = {
  createNode: '➕',
  updateNode: '✏️',
  deleteNode: '🗑️',
  createEdge: '🔗',
  updateEdge: '✏️',
  deleteEdge: '✂️',
  repositionNode: '↔️',
}

const LABELS: Record<string, (n: number) => string> = {
  createNode: (n) => `Create ${n} node${n > 1 ? 's' : ''}`,
  updateNode: (n) => `Update ${n} node${n > 1 ? 's' : ''}`,
  deleteNode: (n) => `Delete ${n} node${n > 1 ? 's' : ''}`,
  createEdge: (n) => `Create ${n} edge${n > 1 ? 's' : ''}`,
  updateEdge: (n) => `Update ${n} edge${n > 1 ? 's' : ''}`,
  deleteEdge: (n) => `Delete ${n} edge${n > 1 ? 's' : ''}`,
  repositionNode: (n) => `Reposition ${n} node${n > 1 ? 's' : ''}`,
}

export function ActionSummaryList({ actionPlan, onDismiss }: Props) {
  if (actionPlan.length === 0) return null

  const counts = countByType(actionPlan)

  return (
    <div className="mx-3 mb-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
      <div className="font-medium text-gray-600 mb-1">Planned actions:</div>
      <ul className="space-y-0.5">
        {Object.entries(counts)
          .filter(([, count]) => count > 0)
          .map(([key, count]) => (
            <li key={key} className="flex items-center gap-1.5 text-gray-700">
              <span>{ICONS[key]}</span>
              <span>{LABELS[key](count)}</span>
            </li>
          ))}
      </ul>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="mt-2 text-[10px] text-gray-500 hover:text-gray-700 underline"
        >
          Dismiss preview
        </button>
      )}
    </div>
  )
}
