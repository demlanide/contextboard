import { apiRequest } from './client'

export interface ChatMessageResponse {
  id: string
  threadId: string
  senderType: 'user' | 'agent' | 'system'
  messageText: string | null
  messageJson: Record<string, unknown>
  selectionContext: Record<string, unknown>
  createdAt: string
}

export interface GetChatResponseData {
  thread: { id: string; boardId: string }
  messages: ChatMessageResponse[]
}

export interface SendMessageResponseData {
  userMessage: ChatMessageResponse
  agentMessage: ChatMessageResponse | null
}

export interface SelectionContext {
  selectedNodeIds?: string[]
  selectedEdgeIds?: string[]
  viewport?: { x: number; y: number; zoom: number }
}

export function getChatHistory(boardId: string) {
  return apiRequest<GetChatResponseData>(`/boards/${boardId}/chat`)
}

export function sendMessage(
  boardId: string,
  message: string,
  selectionContext?: SelectionContext,
) {
  return apiRequest<SendMessageResponseData>(`/boards/${boardId}/chat/messages`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      ...(selectionContext ? { selectionContext } : {}),
    }),
  })
}
