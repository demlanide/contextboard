// T007: Suggest API client
import { apiRequest } from './client'
import type { ChatMessage, ActionPlanItem, PreviewPayload } from '@/store/types'

export interface AgentActionsResponse {
  message: ChatMessage
  actionPlan: ActionPlanItem[]
  preview: PreviewPayload
}

export interface AgentErrorEnvelope {
  data: {
    message: ChatMessage | null
    actionPlan: []
    preview: PreviewPayload
  }
  error: {
    code: string
    message: string
    details: Record<string, unknown>
  } | null
}

export function submitSuggest(
  boardId: string,
  prompt: string,
  mode: 'suggest',
  selectionContext?: {
    selectedNodeIds?: string[]
    selectedEdgeIds?: string[]
    viewport?: { x: number; y: number; zoom: number }
  },
  images?: string[]
) {
  return apiRequest<AgentActionsResponse>(
    `/boards/${encodeURIComponent(boardId)}/agent/actions`,
    {
      method: 'POST',
      body: JSON.stringify({ prompt, mode, selectionContext, images }),
    }
  )
}
