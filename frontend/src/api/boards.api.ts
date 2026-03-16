import { apiRequest } from './client'
import type { BoardMeta, BoardNode, BoardEdge, ChatThreadRef, BoardListItem } from '@/store/types'

interface CreateBoardResponse {
  board: BoardMeta
  chatThread: ChatThreadRef
}

interface HydrateBoardResponse {
  board: BoardMeta
  nodes: BoardNode[]
  edges: BoardEdge[]
  chatThread: ChatThreadRef | null
  lastOperationRevision: number
}

interface ListBoardsResponse {
  boards: BoardMeta[]
}

export function createBoard(title: string) {
  return apiRequest<CreateBoardResponse>('/boards', {
    method: 'POST',
    body: JSON.stringify({ title, description: '' }),
  })
}

export function hydrateBoardState(boardId: string) {
  return apiRequest<HydrateBoardResponse>(`/boards/${encodeURIComponent(boardId)}/state`)
}

export function listBoards() {
  return apiRequest<ListBoardsResponse>('/boards')
}

export function toBoardListItem(board: BoardMeta): BoardListItem {
  return {
    id: board.id,
    title: board.title,
    status: board.status === 'archived' ? 'archived' : 'active',
    updatedAt: board.updatedAt,
    createdAt: board.createdAt,
  }
}
