import { useCallback, useRef } from 'react'
import { useBoardStore } from '@/store/board.store'

export function useNodeDrag(
  nodeId: string,
  onDragEnd: (nodeId: string, newX: number, newY: number) => void,
) {
  const isDragging = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startPosition = useRef({ x: 0, y: 0 })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const node = useBoardStore.getState().nodesById[nodeId]
      if (!node || node.locked) return

      // Don't start drag on resize handles
      if ((e.target as HTMLElement).dataset.resizeHandle) return

      isDragging.current = true
      startPointer.current = { x: e.clientX, y: e.clientY }
      startPosition.current = { x: node.x, y: node.y }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.stopPropagation()
    },
    [nodeId],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - startPointer.current.x
      const dy = e.clientY - startPointer.current.y
      useBoardStore.getState().setNodePosition(
        nodeId,
        startPosition.current.x + dx,
        startPosition.current.y + dy,
      )
    },
    [nodeId],
  )

  const onPointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    const node = useBoardStore.getState().nodesById[nodeId]
    if (node) {
      onDragEnd(nodeId, node.x, node.y)
    }
  }, [nodeId, onDragEnd])

  return {
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
