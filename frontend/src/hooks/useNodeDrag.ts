import { useCallback, useRef } from 'react'
import { useBoardStore } from '@/store/board.store'

export function useNodeDrag(
  nodeId: string,
  onDragEnd: (nodeId: string, newX: number, newY: number) => void,
  onMultiDragEnd?: (moves: Array<{ nodeId: string; x: number; y: number }>) => void,
) {
  const isDragging = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startPosition = useRef({ x: 0, y: 0 })
  const multiDragStartPositions = useRef<Record<string, { x: number; y: number }>>({})

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const state = useBoardStore.getState()
      const node = state.nodesById[nodeId]
      if (!node || node.locked) return

      // Don't start drag on resize handles
      if ((e.target as HTMLElement).dataset.resizeHandle) return

      isDragging.current = true
      startPointer.current = { x: e.clientX, y: e.clientY }
      startPosition.current = { x: node.x, y: node.y }

      // If this node is part of a multi-selection, track all selected node start positions
      const selectedIds = state.ui.selectedNodeIds
      if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
        const positions: Record<string, { x: number; y: number }> = {}
        for (const id of selectedIds) {
          const n = state.nodesById[id]
          if (n && !n.locked) {
            positions[id] = { x: n.x, y: n.y }
          }
        }
        multiDragStartPositions.current = positions
      } else {
        multiDragStartPositions.current = {}
      }

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

      const multiPositions = multiDragStartPositions.current
      if (Object.keys(multiPositions).length > 1) {
        // Multi-select drag: move all selected nodes
        const state = useBoardStore.getState()
        for (const [id, start] of Object.entries(multiPositions)) {
          state.setNodePosition(id, start.x + dx, start.y + dy)
        }
      } else {
        // Single node drag
        useBoardStore.getState().setNodePosition(
          nodeId,
          startPosition.current.x + dx,
          startPosition.current.y + dy,
        )
      }
    },
    [nodeId],
  )

  const onPointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false

    const multiPositions = multiDragStartPositions.current
    if (Object.keys(multiPositions).length > 1 && onMultiDragEnd) {
      // Multi-select drag end: collect all final positions
      const state = useBoardStore.getState()
      const moves: Array<{ nodeId: string; x: number; y: number }> = []
      for (const id of Object.keys(multiPositions)) {
        const node = state.nodesById[id]
        if (node) {
          moves.push({ nodeId: id, x: node.x, y: node.y })
        }
      }
      multiDragStartPositions.current = {}
      if (moves.length > 0) {
        onMultiDragEnd(moves)
      }
    } else {
      // Single node drag end
      const node = useBoardStore.getState().nodesById[nodeId]
      if (node) {
        onDragEnd(nodeId, node.x, node.y)
      }
    }
  }, [nodeId, onDragEnd, onMultiDragEnd])

  return {
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
