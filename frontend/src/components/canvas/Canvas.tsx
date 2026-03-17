import { useCallback, useEffect, useRef, useState } from 'react'
import { useBoardStore } from '@/store/board.store'
import { useCanvasPan } from '@/hooks/useCanvasPan'
import { useNodeMutations } from '@/hooks/useNodeMutations'
import { NodeWrapper } from './nodes/NodeWrapper'
import { NodeRenderer } from './nodes/NodeRenderer'
import { CanvasToolbar } from './CanvasToolbar'
import { UndoToast } from '../shared/UndoToast'
import type { BoardNode } from '@/store/types'

export function Canvas() {
  const nodesById = useBoardStore((s) => s.nodesById)
  const nodeOrder = useBoardStore((s) => s.nodeOrder)
  const pendingNodes = useBoardStore((s) => s.pendingNodes)
  const board = useBoardStore((s) => s.board)
  const placementMode = useBoardStore((s) => s.ui.placementMode)
  const selectedNodeIds = useBoardStore((s) => s.ui.selectedNodeIds)
  const setPlacementMode = useBoardStore((s) => s.setPlacementMode)
  const setSelectedNodeIds = useBoardStore((s) => s.setSelectedNodeIds)
  const setEditingNodeId = useBoardStore((s) => s.setEditingNodeId)

  const { panOffset, handlers } = useCanvasPan()
  const { createNodeAtPosition, deleteNodeWithUndo } = useNodeMutations()
  const containerRef = useRef<HTMLDivElement>(null)

  const [undoToast, setUndoToast] = useState<{ message: string; undoFn: () => void } | null>(null)

  const isActive = board?.status === 'active'

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return

      // Clear selection and editing
      setSelectedNodeIds([])
      setEditingNodeId(null)

      // Handle placement mode
      if (placementMode && isActive) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = e.clientX - rect.left - panOffset.x
        const y = e.clientY - rect.top - panOffset.y
        createNodeAtPosition(placementMode, x, y)
        setPlacementMode(null)
      }
    },
    [placementMode, isActive, panOffset, createNodeAtPosition, setPlacementMode, setSelectedNodeIds, setEditingNodeId],
  )

  const handleNodeClick = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setSelectedNodeIds([nodeId])
    },
    [setSelectedNodeIds],
  )

  const handleNodeDoubleClick = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const node = nodesById[nodeId]
      if (node && !node.locked && (node.type === 'sticky' || node.type === 'text')) {
        setEditingNodeId(nodeId)
      }
    },
    [nodesById, setEditingNodeId],
  )

  // Delete key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't intercept if editing text
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

        if (selectedNodeIds.length > 0 && isActive) {
          const nodeId = selectedNodeIds[0]
          const { undoFn } = deleteNodeWithUndo(nodeId)
          if (undoFn) {
            setSelectedNodeIds([])
            setUndoToast({
              message: 'Node deleted',
              undoFn: () => {
                undoFn()
                setUndoToast(null)
              },
            })
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeIds, isActive, deleteNodeWithUndo, setSelectedNodeIds])

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-gray-50 overflow-hidden relative min-h-0"
      style={{ cursor: placementMode ? 'crosshair' : undefined }}
      {...handlers}
    >
      <CanvasToolbar />

      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
        onClick={handleContentClick}
      >
        {/* Confirmed nodes */}
        {nodeOrder.map((id) => {
          const node = nodesById[id]
          if (!node || node.hidden) return null
          return (
            <NodeWrapper
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              onClick={(e) => handleNodeClick(node.id, e)}
              onDoubleClick={(e) => handleNodeDoubleClick(node.id, e)}
            >
              <NodeRenderer node={node} />
            </NodeWrapper>
          )
        })}

        {/* Pending nodes (optimistic, with reduced opacity) */}
        {Object.values(pendingNodes).map((pending) => {
          const pNode = pending.node as BoardNode
          if (!pNode.type) return null
          return (
            <div
              key={pending.tempId}
              className="absolute opacity-50"
              style={{
                left: pNode.x,
                top: pNode.y,
                width: pNode.width,
                height: pNode.height,
              }}
            >
              <NodeRenderer node={pNode as BoardNode} />
            </div>
          )
        })}
      </div>

      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={undoToast.undoFn}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
  )
}
