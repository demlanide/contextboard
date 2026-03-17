interface SelectionBadgeProps {
  selectionContext: Record<string, unknown>
}

export function SelectionBadge({ selectionContext }: SelectionBadgeProps) {
  const nodeIds = selectionContext.selectedNodeIds as string[] | undefined
  const edgeIds = selectionContext.selectedEdgeIds as string[] | undefined

  const nodeCount = nodeIds?.length ?? 0
  const edgeCount = edgeIds?.length ?? 0

  if (nodeCount === 0 && edgeCount === 0) return null

  const parts: string[] = []
  if (nodeCount > 0) parts.push(`${nodeCount} node${nodeCount !== 1 ? 's' : ''}`)
  if (edgeCount > 0) parts.push(`${edgeCount} edge${edgeCount !== 1 ? 's' : ''}`)

  return (
    <span className="mt-1 block text-[10px] text-gray-400 italic">
      {parts.join(', ')} selected
    </span>
  )
}
