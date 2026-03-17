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
