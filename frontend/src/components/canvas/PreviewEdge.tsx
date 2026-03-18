// T019: PreviewEdge — renders a single preview edge with distinct styling
// Note: this file is for agent preview edges, not the existing connection drag PreviewEdge

interface Props {
  actionType: 'create' | 'delete'
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

export function AgentPreviewEdge({ actionType, sourceX, sourceY, targetX, targetY }: Props) {
  const color = actionType === 'create' ? '#3b82f6' : '#ef4444'
  const opacity = actionType === 'create' ? 0.6 : 0.4

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: 'visible', opacity }}
    >
      <line
        x1={sourceX}
        y1={sourceY}
        x2={targetX}
        y2={targetY}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {actionType === 'delete' && (
        <>
          {/* Strikethrough indicator at midpoint */}
          <circle
            cx={(sourceX + targetX) / 2}
            cy={(sourceY + targetY) / 2}
            r={6}
            fill={color}
            fillOpacity={0.3}
          />
          <text
            x={(sourceX + targetX) / 2}
            y={(sourceY + targetY) / 2 + 3}
            textAnchor="middle"
            fontSize={8}
            fill={color}
          >
            ×
          </text>
        </>
      )}
    </svg>
  )
}
