import { useCallback, useRef } from 'react'
import { useBoardStore } from '@/store/board.store'

export function useNodeResize(
  nodeId: string,
  onResizeEnd: (nodeId: string, newWidth: number, newHeight: number) => void,
) {
  const isResizing = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startDimensions = useRef({ width: 0, height: 0 })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const node = useBoardStore.getState().nodesById[nodeId]
      if (!node || node.locked) return

      isResizing.current = true
      startPointer.current = { x: e.clientX, y: e.clientY }
      startDimensions.current = { width: node.width, height: node.height }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      e.stopPropagation()
    },
    [nodeId],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing.current) return
      const dx = e.clientX - startPointer.current.x
      const dy = e.clientY - startPointer.current.y
      const newWidth = Math.min(10_000, Math.max(20, startDimensions.current.width + dx))
      const newHeight = Math.min(10_000, Math.max(20, startDimensions.current.height + dy))
      useBoardStore.getState().updateNodeOptimistic(nodeId, {
        width: newWidth,
        height: newHeight,
      })
    },
    [nodeId],
  )

  const onPointerUp = useCallback(() => {
    if (!isResizing.current) return
    isResizing.current = false
    const node = useBoardStore.getState().nodesById[nodeId]
    if (node) {
      onResizeEnd(nodeId, node.width, node.height)
    }
  }, [nodeId, onResizeEnd])

  return {
    resizeHandlers: { onPointerDown, onPointerMove, onPointerUp },
    isResizing: isResizing.current,
  }
}
