interface PreviewEdgeProps {
  sourceX: number
  sourceY: number
  cursorX: number
  cursorY: number
  isValid: boolean
}

export function PreviewEdge({ sourceX, sourceY, cursorX, cursorY, isValid }: PreviewEdgeProps) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none', overflow: 'visible' }}
    >
      <line
        x1={sourceX}
        y1={sourceY}
        x2={cursorX}
        y2={cursorY}
        stroke={isValid ? '#3B82F6' : '#9CA3AF'}
        strokeWidth={2}
        strokeDasharray="6 4"
        style={{ pointerEvents: 'none' }}
      />
    </svg>
  )
}
