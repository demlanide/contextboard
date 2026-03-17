import { useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'

export function useEdgeConnection(
  onConnect?: (sourceNodeId: string, targetNodeId: string) => void,
) {
  const store = useBoardStore

  const startConnection = useCallback(
    (nodeId: string, e: React.PointerEvent) => {
      store.getState().setConnectionDrag({
        sourceNodeId: nodeId,
        cursorX: e.clientX,
        cursorY: e.clientY,
        hoveredTargetId: null,
        isValid: false,
      })
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const state = store.getState()
      const drag = state.ui.connectionDrag
      if (!drag) return

      // Hit-test: find which node the cursor is over
      const elements = document.elementsFromPoint(e.clientX, e.clientY)
      let hoveredTargetId: string | null = null

      for (const el of elements) {
        const nodeEl = (el as HTMLElement).closest?.('[data-node-id]') as HTMLElement | null
        if (nodeEl) {
          hoveredTargetId = nodeEl.dataset.nodeId ?? null
          break
        }
      }

      const isValid =
        hoveredTargetId !== null &&
        hoveredTargetId !== drag.sourceNodeId &&
        !!state.nodesById[hoveredTargetId]

      state.setConnectionDrag({
        ...drag,
        cursorX: e.clientX,
        cursorY: e.clientY,
        hoveredTargetId,
        isValid,
      })
    },
    [],
  )

  const endConnection = useCallback(() => {
    const state = store.getState()
    const drag = state.ui.connectionDrag
    if (!drag) return

    state.setConnectionDrag(null)

    if (drag.isValid && drag.hoveredTargetId) {
      onConnect?.(drag.sourceNodeId, drag.hoveredTargetId)
    }
  }, [onConnect])

  return {
    startConnection,
    handlePointerMove,
    endConnection,
  }
}
