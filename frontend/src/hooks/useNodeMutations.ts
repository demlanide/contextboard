import { useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import * as nodesApi from '@/api/nodes.api'
import type { BoardNode } from '@/store/types'

const DEFAULT_DIMENSIONS: Record<string, { width: number; height: number; content: Record<string, unknown> }> = {
  sticky: { width: 200, height: 120, content: { text: 'New sticky' } },
  text: { width: 240, height: 160, content: { text: 'New text' } },
  shape: { width: 160, height: 160, content: { shapeType: 'rectangle' } },
}

export function useNodeMutations() {
  const store = useBoardStore

  const createNodeAtPosition = useCallback(
    async (type: BoardNode['type'], x: number, y: number) => {
      const boardId = store.getState().boardId
      if (!boardId) return

      const defaults = DEFAULT_DIMENSIONS[type]
      if (!defaults) return

      const tempId = crypto.randomUUID()
      const partialNode: Partial<BoardNode> = {
        type,
        x,
        y,
        width: defaults.width,
        height: defaults.height,
        content: defaults.content,
        style: type === 'sticky' ? { backgroundColor: '#FFEB3B' } : {},
        metadata: {},
        locked: false,
        hidden: false,
        rotation: 0,
        zIndex: 0,
      }

      store.getState().addPendingNode(tempId, partialNode)

      const result = await nodesApi.createNode(boardId, {
        type,
        x,
        y,
        width: defaults.width,
        height: defaults.height,
        content: defaults.content,
        style: partialNode.style,
      })

      if (result.data) {
        store.getState().confirmNode(tempId, result.data.node, result.data.boardRevision)
      } else {
        store.getState().rollbackPendingNode(tempId)
      }
    },
    [],
  )

  const updateNodeContent = useCallback(
    async (nodeId: string, contentPatch: Record<string, unknown>) => {
      const snapshot = store.getState().nodesById[nodeId]
      if (!snapshot) return

      store.getState().updateNodeOptimistic(nodeId, {
        content: { ...snapshot.content, ...contentPatch },
      })

      const result = await nodesApi.updateNode(nodeId, { content: contentPatch })

      if (result.data) {
        store.getState().confirmNodeUpdate(nodeId, result.data.node, result.data.boardRevision)
      } else {
        store.getState().rollbackNodeUpdate(nodeId, snapshot)
      }
    },
    [],
  )

  const updateNodeStyle = useCallback(
    async (nodeId: string, stylePatch: Record<string, unknown>) => {
      const snapshot = store.getState().nodesById[nodeId]
      if (!snapshot) return

      store.getState().updateNodeOptimistic(nodeId, {
        style: { ...snapshot.style, ...stylePatch },
      })

      const result = await nodesApi.updateNode(nodeId, { style: stylePatch })

      if (result.data) {
        store.getState().confirmNodeUpdate(nodeId, result.data.node, result.data.boardRevision)
      } else {
        store.getState().rollbackNodeUpdate(nodeId, snapshot)
      }
    },
    [],
  )

  const updateNodePosition = useCallback(async (nodeId: string, x: number, y: number) => {
    const snapshot = store.getState().nodesById[nodeId]
    if (!snapshot) return

    const result = await nodesApi.updateNode(nodeId, { x, y })

    if (result.data) {
      store.getState().confirmNodeUpdate(nodeId, result.data.node, result.data.boardRevision)
    } else {
      store.getState().rollbackNodeUpdate(nodeId, snapshot)
    }
  }, [])

  const updateNodeDimensions = useCallback(
    async (nodeId: string, width: number, height: number) => {
      const snapshot = store.getState().nodesById[nodeId]
      if (!snapshot) return

      store.getState().updateNodeOptimistic(nodeId, { width, height })

      const result = await nodesApi.updateNode(nodeId, { width, height })

      if (result.data) {
        store.getState().confirmNodeUpdate(nodeId, result.data.node, result.data.boardRevision)
      } else {
        store.getState().rollbackNodeUpdate(nodeId, snapshot)
      }
    },
    [],
  )

  const deleteNodeWithUndo = useCallback(
    (nodeId: string): { undoFn: (() => void) | null } => {
      const node = store.getState().nodesById[nodeId]
      if (!node) return { undoFn: null }
      if (node.locked) return { undoFn: null }

      const snapshot = store.getState().deleteNodeOptimistic(nodeId)
      if (!snapshot) return { undoFn: null }

      let undone = false

      const undoFn = () => {
        undone = true
        store.getState().undoDeleteNode(snapshot)
      }

      nodesApi.deleteNode(nodeId).then((result) => {
        if (undone) return
        if (result.data) {
          store
            .getState()
            .confirmNodeDelete(nodeId, result.data.deletedEdgeIds, result.data.boardRevision)
        } else {
          store.getState().undoDeleteNode(snapshot)
        }
      })

      return { undoFn }
    },
    [],
  )

  return {
    createNodeAtPosition,
    updateNodeContent,
    updateNodeStyle,
    updateNodePosition,
    updateNodeDimensions,
    deleteNodeWithUndo,
  }
}
