import type { BoardNode } from '@/store/types'

interface ShapeNodeProps {
  node: BoardNode
}

export function ShapeNode({ node }: ShapeNodeProps) {
  const shapeType = node.content.shapeType as string
  const text = node.content.text as string | undefined
  const backgroundColor = (node.style.backgroundColor as string) ?? '#E3F2FD'
  const borderColor = (node.style.borderColor as string) ?? '#90CAF9'
  const textColor = (node.style.textColor as string) ?? '#000000'

  const shapeStyles: React.CSSProperties = {
    backgroundColor,
    borderColor,
    borderWidth: 2,
    borderStyle: 'solid',
    color: textColor,
  }

  if (shapeType === 'ellipse') {
    shapeStyles.borderRadius = '50%'
  } else if (shapeType === 'diamond') {
    shapeStyles.transform = 'rotate(45deg)'
    shapeStyles.borderRadius = 4
  } else {
    // rectangle
    shapeStyles.borderRadius = 8
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center select-none"
      style={shapeStyles}
    >
      {text && (
        <span
          className="text-sm text-center px-2 overflow-hidden"
          style={shapeType === 'diamond' ? { transform: 'rotate(-45deg)' } : undefined}
        >
          {text}
        </span>
      )}
    </div>
  )
}
