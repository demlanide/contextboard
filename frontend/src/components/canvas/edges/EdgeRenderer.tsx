import type { BoardEdge, BoardNode } from '@/store/types'

interface EdgeRendererProps {
  edges: BoardEdge[]
  nodesById: Record<string, BoardNode>
  selectedEdgeId: string | null
  onEdgeClick?: (edgeId: string, e: React.MouseEvent) => void
  onEdgeDoubleClick?: (edgeId: string, e: React.MouseEvent) => void
}

export function EdgeRenderer({
  edges,
  nodesById,
  selectedEdgeId,
  onEdgeClick,
  onEdgeDoubleClick,
}: EdgeRendererProps) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none', overflow: 'visible' }}
    >
      {edges.map((edge) => {
        const source = nodesById[edge.sourceNodeId]
        const target = nodesById[edge.targetNodeId]
        if (!source || !target) return null

        const sx = source.x + source.width / 2
        const sy = source.y + source.height / 2
        const tx = target.x + target.width / 2
        const ty = target.y + target.height / 2
        const mx = (sx + tx) / 2
        const my = (sy + ty) / 2

        const isSelected = edge.id === selectedEdgeId
        const strokeColor = isSelected
          ? '#3B82F6'
          : (edge.style.strokeColor as string) ?? '#9CA3AF'
        const strokeWidth = isSelected ? 3 : 1.5

        return (
          <g key={edge.id}>
            {/* Invisible wider hit area for easier clicking */}
            <line
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                onEdgeClick?.(edge.id, e)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onEdgeDoubleClick?.(edge.id, e)
              }}
            />
            {/* Visible edge line */}
            <line
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              style={{ pointerEvents: 'none' }}
            />
            {edge.label && (
              <text
                x={mx}
                y={my}
                textAnchor="middle"
                dy="-6"
                fill="#374151"
                fontSize={12}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {edge.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
