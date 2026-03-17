import { useCallback, useRef, useState } from 'react'

interface PanOffset {
  x: number
  y: number
}

const PAN_THRESHOLD = 3 // pixels before panning activates

export function useCanvasPan() {
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 })
  const [isPanningState, setIsPanningState] = useState(false)
  const pointerDown = useRef(false)
  const isPanning = useRef(false)
  const startPoint = useRef({ x: 0, y: 0 })
  const startOffset = useRef({ x: 0, y: 0 })
  const containerEl = useRef<HTMLElement | null>(null)
  const pointerId = useRef<number | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-node-id]') || target.closest('[data-resize-handle]')) return
      // Record the intent to pan — actual panning starts after movement threshold
      pointerDown.current = true
      isPanning.current = false
      startPoint.current = { x: e.clientX, y: e.clientY }
      startOffset.current = { ...panOffset }
      containerEl.current = e.currentTarget as HTMLElement
      pointerId.current = e.pointerId
    },
    [panOffset],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDown.current) return
    const dx = e.clientX - startPoint.current.x
    const dy = e.clientY - startPoint.current.y

    if (!isPanning.current) {
      // Only start panning after exceeding the threshold
      if (Math.abs(dx) < PAN_THRESHOLD && Math.abs(dy) < PAN_THRESHOLD) return
      isPanning.current = true
      setIsPanningState(true)
      // Capture pointer once we know this is a drag, not a click
      if (containerEl.current && pointerId.current !== null) {
        containerEl.current.setPointerCapture(pointerId.current)
      }
    }

    setPanOffset({
      x: startOffset.current.x + dx,
      y: startOffset.current.y + dy,
    })
  }, [])

  const onPointerUp = useCallback(() => {
    pointerDown.current = false
    isPanning.current = false
    setIsPanningState(false)
    containerEl.current = null
    pointerId.current = null
  }, [])

  return {
    panOffset,
    isPanning: isPanningState,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
