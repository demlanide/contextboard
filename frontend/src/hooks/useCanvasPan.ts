import { useCallback, useRef, useState } from 'react'

interface PanOffset {
  x: number
  y: number
}

export function useCanvasPan() {
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 })
  const [isPanningState, setIsPanningState] = useState(false)
  const isPanning = useRef(false)
  const startPoint = useRef({ x: 0, y: 0 })
  const startOffset = useRef({ x: 0, y: 0 })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only pan on canvas background clicks (not on nodes or interactive elements)
      const target = e.target as HTMLElement
      if (target.closest('[data-node-id]') || target.closest('[data-resize-handle]')) return
      isPanning.current = true
      setIsPanningState(true)
      startPoint.current = { x: e.clientX, y: e.clientY }
      startOffset.current = { ...panOffset }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [panOffset],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - startPoint.current.x
    const dy = e.clientY - startPoint.current.y
    setPanOffset({
      x: startOffset.current.x + dx,
      y: startOffset.current.y + dy,
    })
  }, [])

  const onPointerUp = useCallback(() => {
    isPanning.current = false
    setIsPanningState(false)
  }, [])

  return {
    panOffset,
    isPanning: isPanningState,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
