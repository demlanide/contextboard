import { apiRequest } from './client'
import type { BoardNode } from '@/store/types'

interface NodeResponseData {
  node: BoardNode
  boardRevision: number
}

interface DeleteNodeResponseData {
  success: boolean
  deletedNodeId: string
  deletedEdgeIds: string[]
  boardRevision: number
}

// ─── Batch Types ──────────────────────────────────────────────────────────────

export type BatchOperationItem =
  | { type: 'create'; tempId: string; node: {
      type: BoardNode['type']
      x: number; y: number; width: number; height: number
      content: Record<string, unknown>
      style?: Record<string, unknown>
      metadata?: Record<string, unknown>
    } }
  | { type: 'update'; nodeId: string; changes: Record<string, unknown> }
  | { type: 'delete'; nodeId: string }

export interface BatchDeletedEntry {
  id: string
  type: 'node' | 'edge'
}

export interface BatchResponse {
  batchId: string
  boardRevision: number
  created: (BoardNode & { tempId: string })[]
  updated: BoardNode[]
  deleted: BatchDeletedEntry[]
}

export async function createNode(
  boardId: string,
  body: {
    type: BoardNode['type']
    x: number
    y: number
    width: number
    height: number
    content: Record<string, unknown>
    style?: Record<string, unknown>
    metadata?: Record<string, unknown>
  },
) {
  return apiRequest<NodeResponseData>(`/boards/${boardId}/nodes`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateNode(
  nodeId: string,
  patch: Record<string, unknown>,
) {
  return apiRequest<NodeResponseData>(`/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify(patch),
  })
}

export async function deleteNode(nodeId: string) {
  return apiRequest<DeleteNodeResponseData>(`/nodes/${nodeId}`, {
    method: 'DELETE',
  })
}

export async function batchNodeMutations(
  boardId: string,
  operations: BatchOperationItem[],
) {
  return apiRequest<BatchResponse>(`/boards/${boardId}/nodes/batch`, {
    method: 'POST',
    body: JSON.stringify({ operations }),
  })
}
