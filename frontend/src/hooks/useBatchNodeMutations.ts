import { useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import * as nodesApi from '@/api/nodes.api'
import type { BoardNode } from '@/store/types'

export function useBatchNodeMutations() {
  const store = useBoardStore

  const batchMoveNodes = useCallback(
    async (moves: Array<{ nodeId: string; x: number; y: number }>) => {
      const boardId = store.getState().boardId
      if (!boardId) return

      store.getState().batchMoveOptimistic(moves)

      const operations: nodesApi.BatchOperationItem[] = moves.map((move) => ({
        type: 'update' as const,
        nodeId: move.nodeId,
        changes: { x: move.x, y: move.y },
      }))

      const result = await nodesApi.batchNodeMutations(boardId, operations)

      if (result.data) {
        store.getState().reconcileBatch(result.data)
      } else {
        store.getState().rollbackBatch()
      }
    },
    [],
  )

  const batchCreateNodes = useCallback(
    async (
      items: Array<{
        tempId: string
        type: BoardNode['type']
        x: number
        y: number
        width: number
        height: number
        content: Record<string, unknown>
        style?: Record<string, unknown>
        metadata?: Record<string, unknown>
      }>,
    ) => {
      const boardId = store.getState().boardId
      if (!boardId) return

      const partialNodes = items.map((item) => ({
        tempId: item.tempId,
        node: {
          type: item.type,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          content: item.content,
          style: item.style ?? {},
          metadata: item.metadata ?? {},
          locked: false,
          hidden: false,
          rotation: 0,
          zIndex: 0,
        } as Partial<BoardNode>,
      }))

      store.getState().batchCreateOptimistic(partialNodes)

      const operations: nodesApi.BatchOperationItem[] = items.map((item) => ({
        type: 'create' as const,
        tempId: item.tempId,
        node: {
          type: item.type,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          content: item.content,
          style: item.style,
          metadata: item.metadata,
        },
      }))

      const result = await nodesApi.batchNodeMutations(boardId, operations)

      if (result.data) {
        store.getState().confirmBatchCreate(result.data)
      } else {
        store.getState().rollbackBatchCreate()
      }
    },
    [],
  )

  const batchDeleteNodes = useCallback(
    async (nodeIds: string[]) => {
      const boardId = store.getState().boardId
      if (!boardId) return

      // Filter out locked nodes
      const state = store.getState()
      const unlocked = nodeIds.filter((id) => {
        const node = state.nodesById[id]
        return node && !node.locked
      })
      if (unlocked.length === 0) return

      const { nodeSnapshots, edgeSnapshots } = store.getState().batchDeleteOptimistic(unlocked)

      const operations: nodesApi.BatchOperationItem[] = unlocked.map((nodeId) => ({
        type: 'delete' as const,
        nodeId,
      }))

      const result = await nodesApi.batchNodeMutations(boardId, operations)

      if (result.data) {
        store.getState().reconcileBatch(result.data)
      } else {
        store.getState().rollbackBatchDelete(nodeSnapshots, edgeSnapshots)
      }
    },
    [],
  )

  return { batchMoveNodes, batchCreateNodes, batchDeleteNodes }
}
