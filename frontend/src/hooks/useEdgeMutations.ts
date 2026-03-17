import { useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import * as edgesApi from '@/api/edges.api'
import type { BoardEdge } from '@/store/types'

interface UseEdgeMutationsOptions {
  onError?: (message: string) => void
}

export function useEdgeMutations(options: UseEdgeMutationsOptions = {}) {
  const store = useBoardStore
  const { onError } = options

  const createEdge = useCallback(
    async (boardId: string, sourceNodeId: string, targetNodeId: string) => {
      const tempId = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimisticEdge: BoardEdge = {
        id: tempId,
        boardId,
        sourceNodeId,
        targetNodeId,
        label: null,
        style: {},
        metadata: {},
        createdAt: now,
        updatedAt: now,
      }

      store.getState().addEdgeOptimistic(tempId, optimisticEdge)
      store.getState().setConnectionDrag(null)

      try {
        const result = await edgesApi.createEdge(boardId, {
          sourceNodeId,
          targetNodeId,
        })

        if (result.data) {
          store.getState().confirmEdge(tempId, result.data.edge, result.data.boardRevision)
        } else {
          store.getState().rollbackEdge(tempId)
          onError?.(result.error?.message ?? 'Failed to create edge')
        }
      } catch {
        store.getState().rollbackEdge(tempId)
        onError?.('Failed to create edge')
      }
    },
    [onError],
  )

  const updateEdge = useCallback(
    async (edgeId: string, patch: edgesApi.UpdateEdgeBody) => {
      const snapshot = store.getState().edgesById[edgeId]
      if (!snapshot) return

      store.getState().updateEdgeOptimistic(edgeId, patch as Partial<BoardEdge>)

      try {
        const result = await edgesApi.updateEdge(edgeId, patch)

        if (result.data) {
          store.getState().confirmEdgeUpdate(edgeId, result.data.edge, result.data.boardRevision)
        } else {
          store.getState().rollbackEdgeUpdate(edgeId, snapshot)
          onError?.(result.error?.message ?? 'Failed to update edge')
        }
      } catch {
        store.getState().rollbackEdgeUpdate(edgeId, snapshot)
        onError?.('Failed to update edge')
      }
    },
    [onError],
  )

  const deleteEdge = useCallback(
    (edgeId: string): { undoFn: (() => void) | null } => {
      const snapshot = store.getState().removeEdgeOptimistic(edgeId)
      if (!snapshot) return { undoFn: null }

      let undone = false

      const undoFn = () => {
        undone = true
        store.getState().undoEdgeDelete(snapshot)
      }

      edgesApi.deleteEdge(edgeId).then((result) => {
        if (undone) return
        if (result.data) {
          store.getState().confirmEdgeDelete(edgeId, result.data.boardRevision)
        } else {
          store.getState().undoEdgeDelete(snapshot)
          onError?.(result.error?.message ?? 'Failed to delete edge')
        }
      })

      return { undoFn }
    },
    [onError],
  )

  return { createEdge, updateEdge, deleteEdge }
}
