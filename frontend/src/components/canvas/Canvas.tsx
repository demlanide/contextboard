import { useCallback, useEffect, useRef, useState } from 'react'
import { useBoardStore } from '@/store/board.store'
import { useCanvasPan } from '@/hooks/useCanvasPan'
import { useNodeMutations } from '@/hooks/useNodeMutations'
import { useEdgeConnection } from '@/hooks/useEdgeConnection'
import { useEdgeMutations } from '@/hooks/useEdgeMutations'
import { NodeWrapper } from './nodes/NodeWrapper'
import { NodeRenderer } from './nodes/NodeRenderer'
import { EdgeRenderer } from './edges/EdgeRenderer'
import { PreviewEdge } from './edges/PreviewEdge'
import { ConnectionHandle } from './edges/ConnectionHandle'
import { EdgeLabelEditor } from './edges/EdgeLabelEditor'
import { CanvasToolbar } from './CanvasToolbar'
import { UndoToast } from '../shared/UndoToast'
import { ErrorToast } from '../shared/ErrorToast'
import type { BoardNode } from '@/store/types'

export function Canvas() {
  const nodesById = useBoardStore((s) => s.nodesById)
  const nodeOrder = useBoardStore((s) => s.nodeOrder)
  const edgesById = useBoardStore((s) => s.edgesById)
  const edgeOrder = useBoardStore((s) => s.edgeOrder)
  const pendingNodes = useBoardStore((s) => s.pendingNodes)
  const board = useBoardStore((s) => s.board)
  const placementMode = useBoardStore((s) => s.ui.placementMode)
  const selectedNodeIds = useBoardStore((s) => s.ui.selectedNodeIds)
  const selectedEdgeId = useBoardStore((s) => s.ui.selectedEdgeId)
  const connectionDrag = useBoardStore((s) => s.ui.connectionDrag)
  const setPlacementMode = useBoardStore((s) => s.setPlacementMode)
  const setSelectedNodeIds = useBoardStore((s) => s.setSelectedNodeIds)
  const setEditingNodeId = useBoardStore((s) => s.setEditingNodeId)
  const setSelectedEdgeId = useBoardStore((s) => s.setSelectedEdgeId)

  const { panOffset, handlers } = useCanvasPan()
  const { createNodeAtPosition, deleteNodeWithUndo } = useNodeMutations()
  const [edgeError, setEdgeError] = useState<string | null>(null)
  const { createEdge: createEdgeMutation, updateEdge: updateEdgeMutation, deleteEdge: deleteEdgeMutation } = useEdgeMutations({
    onError: (message) => setEdgeError(message),
  })

  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)

  const handleEdgeConnect = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      const boardId = board?.id
      if (!boardId) return
      createEdgeMutation(boardId, sourceNodeId, targetNodeId)
    },
    [board?.id, createEdgeMutation],
  )

  const { startConnection, handlePointerMove: handleConnectionMove, endConnection } = useEdgeConnection(handleEdgeConnect)
  const containerRef = useRef<HTMLDivElement>(null)

  const [undoToast, setUndoToast] = useState<{ message: string; undoFn: () => void } | null>(null)

  const isActive = board?.status === 'active'

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return

      // Clear selection and editing
      setSelectedNodeIds([])
      setEditingNodeId(null)
      setSelectedEdgeId(null)
      setEditingEdgeId(null)

      // Handle placement mode
      if (placementMode && isActive) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = e.clientX - rect.left - panOffset.x
        const y = e.clientY - rect.top - panOffset.y
        createNodeAtPosition(placementMode, x, y)
        setPlacementMode(null)
      }
    },
    [placementMode, isActive, panOffset, createNodeAtPosition, setPlacementMode, setSelectedNodeIds, setEditingNodeId, setSelectedEdgeId],
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

  const handleEdgeClick = useCallback(
    (edgeId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setSelectedNodeIds([])
      setSelectedEdgeId(edgeId)
    },
    [setSelectedNodeIds, setSelectedEdgeId],
  )

  const handleEdgeDoubleClick = useCallback(
    (edgeId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!isActive) return
      setSelectedEdgeId(edgeId)
      setEditingEdgeId(edgeId)
    },
    [isActive, setSelectedEdgeId],
  )

  const handleEdgeLabelSubmit = useCallback(
    (label: string | null) => {
      if (editingEdgeId) {
        updateEdgeMutation(editingEdgeId, { label })
      }
      setEditingEdgeId(null)
    },
    [editingEdgeId, updateEdgeMutation],
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
        } else if (selectedEdgeId && isActive) {
          const { undoFn } = deleteEdgeMutation(selectedEdgeId)
          if (undoFn) {
            setSelectedEdgeId(null)
            setUndoToast({
              message: 'Edge deleted',
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
  }, [selectedNodeIds, selectedEdgeId, isActive, deleteNodeWithUndo, deleteEdgeMutation, setSelectedNodeIds, setSelectedEdgeId])

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-gray-50 overflow-hidden relative min-h-0"
      style={{ cursor: placementMode ? 'crosshair' : connectionDrag ? 'crosshair' : undefined }}
      {...handlers}
      onPointerMove={(e) => {
        handlers.onPointerMove?.(e)
        handleConnectionMove(e)
      }}
      onPointerUp={(e) => {
        handlers.onPointerUp?.(e)
        endConnection()
      }}
    >
      <CanvasToolbar />

      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
        onClick={handleContentClick}
      >
        {/* Edge layer (rendered behind nodes) */}
        <EdgeRenderer
          edges={edgeOrder.map((id) => edgesById[id]).filter(Boolean)}
          nodesById={nodesById}
          selectedEdgeId={selectedEdgeId}
          onEdgeClick={handleEdgeClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
        />

        {/* Preview edge during connection drag */}
        {connectionDrag && (() => {
          const sourceNode = nodesById[connectionDrag.sourceNodeId]
          if (!sourceNode) return null
          const containerEl = containerRef.current
          if (!containerEl) return null
          const rect = containerEl.getBoundingClientRect()
          return (
            <PreviewEdge
              sourceX={sourceNode.x + sourceNode.width / 2}
              sourceY={sourceNode.y + sourceNode.height / 2}
              cursorX={connectionDrag.cursorX - rect.left - panOffset.x}
              cursorY={connectionDrag.cursorY - rect.top - panOffset.y}
              isValid={connectionDrag.isValid}
            />
          )
        })()}

        {/* Confirmed nodes */}
        {nodeOrder.map((id) => {
          const node = nodesById[id]
          if (!node || node.hidden) return null
          return (
            <NodeWrapper
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              connectionDragSourceId={connectionDrag?.sourceNodeId ?? null}
              onClick={(e) => handleNodeClick(node.id, e)}
              onDoubleClick={(e) => handleNodeDoubleClick(node.id, e)}
            >
              <NodeRenderer node={node} />
              {isActive && (
                <ConnectionHandle
                  nodeId={node.id}
                  onConnectionStart={startConnection}
                />
              )}
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

        {/* Edge label editor */}
        {editingEdgeId && (() => {
          const edge = edgesById[editingEdgeId]
          if (!edge) return null
          const source = nodesById[edge.sourceNodeId]
          const target = nodesById[edge.targetNodeId]
          if (!source || !target) return null
          const mx = (source.x + source.width / 2 + target.x + target.width / 2) / 2
          const my = (source.y + source.height / 2 + target.y + target.height / 2) / 2
          return (
            <EdgeLabelEditor
              x={mx}
              y={my}
              currentLabel={edge.label}
              onSubmit={handleEdgeLabelSubmit}
              onCancel={() => setEditingEdgeId(null)}
            />
          )
        })()}
      </div>

      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={undoToast.undoFn}
          onDismiss={() => setUndoToast(null)}
        />
      )}

      {edgeError && (
        <ErrorToast
          message={edgeError}
          onDismiss={() => setEdgeError(null)}
        />
      )}
    </div>
  )
}
