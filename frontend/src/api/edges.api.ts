import { apiRequest } from './client'
import type { BoardEdge } from '@/store/types'

export interface CreateEdgeBody {
  sourceNodeId: string
  targetNodeId: string
  label?: string | null
  style?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface UpdateEdgeBody {
  label?: string | null
  style?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface EdgeResponseData {
  edge: BoardEdge
  boardRevision: number
}

export interface DeleteEdgeResponseData {
  success: boolean
  deletedEdgeId: string
  boardRevision: number
}

export async function createEdge(boardId: string, body: CreateEdgeBody) {
  return apiRequest<EdgeResponseData>(`/boards/${boardId}/edges`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEdge(edgeId: string, patch: UpdateEdgeBody) {
  return apiRequest<EdgeResponseData>(`/edges/${edgeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify(patch),
  })
}

export async function deleteEdge(edgeId: string) {
  return apiRequest<DeleteEdgeResponseData>(`/edges/${edgeId}`, {
    method: 'DELETE',
  })
}
