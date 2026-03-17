import { useBoardStore } from '@/store/board.store'
import { useNodeDrag } from '@/hooks/useNodeDrag'
import { useNodeResize } from '@/hooks/useNodeResize'
import { useNodeMutations } from '@/hooks/useNodeMutations'
import { useBatchNodeMutations } from '@/hooks/useBatchNodeMutations'
import type { BoardNode } from '@/store/types'

interface NodeWrapperProps {
  node: BoardNode
  isSelected?: boolean
  connectionDragSourceId?: string | null
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
}

export function NodeWrapper({
  node,
  isSelected,
  connectionDragSourceId,
  children,
  onClick,
  onDoubleClick,
}: NodeWrapperProps) {
  const mutationStatus = useBoardStore((s) => s.nodeMutationStatus[node.id])
  const batchStatus = useBoardStore((s) => s.batchMutation.status)
  const isAffectedByBatch = useBoardStore((s) => s.batchMutation.affectedNodeIds.includes(node.id))
  const { updateNodePosition, updateNodeDimensions } = useNodeMutations()
  const { batchMoveNodes } = useBatchNodeMutations()

  const { dragHandlers } = useNodeDrag(
    node.id,
    (_id, x, y) => {
      updateNodePosition(node.id, x, y)
    },
    (moves) => {
      batchMoveNodes(moves)
    },
  )

  const { resizeHandlers } = useNodeResize(node.id, (_id, w, h) => {
    updateNodeDimensions(node.id, w, h)
  })

  if (node.hidden) return null

  const opacity = (node.style.opacity as number) ?? 1
  const isPending = mutationStatus === 'pending' || (batchStatus === 'pending' && isAffectedByBatch)
  const isFailed = mutationStatus === 'failed' || (batchStatus === 'error' && isAffectedByBatch)

  // Connection drag feedback
  const isDragSource = connectionDragSourceId === node.id
  const isValidTarget = connectionDragSourceId != null && connectionDragSourceId !== node.id

  return (
    <div
      className="absolute"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: node.zIndex,
        transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
        opacity: isPending ? 0.7 : isDragSource ? 0.5 : opacity,
        outline: isSelected
          ? '2px solid #3B82F6'
          : isFailed
            ? '2px solid #F87171'
            : isValidTarget
              ? '2px solid #4ADE80'
              : isDragSource
                ? '2px solid #FCA5A5'
                : 'none',
        outlineOffset: 1,
        boxSizing: 'border-box',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-node-id={node.id}
      {...dragHandlers}
    >
      {isPending && (
        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
      )}
      {isFailed && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-400 flex items-center justify-center text-white text-xs cursor-pointer">
          !
        </div>
      )}
      {children}
      {/* Resize handle at bottom-right corner when selected */}
      {isSelected && !node.locked && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize"
          style={{ transform: 'translate(50%, 50%)' }}
          data-resize-handle="true"
          {...resizeHandlers}
        />
      )}
    </div>
  )
}
